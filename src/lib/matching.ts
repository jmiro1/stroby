import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "./supabase";
import { getSearchNiches, getNicheDistance } from "./niche-affinity";
import { logApiUsage } from "./api-usage";

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return _anthropic;
}

export interface BusinessProfile {
  id: string;
  company_name: string;
  product_description: string | null;
  target_customer: string | null;
  campaign_goal: string | null;
  description: string | null;
  primary_niche: string | null;
  budget_range: string | null;
  partner_preference: string | null;
  onboarding_status: string | null;
}

export interface NewsletterProfile {
  id: string;
  slug: string | null;
  newsletter_name: string;
  primary_niche: string | null;
  description: string | null;
  subscriber_count: number | null;
  avg_open_rate: number | null;
  avg_ctr: number | null;
  price_per_placement: number | null;
  api_verified: boolean | null;
  screenshot_verified: boolean | null;
  avg_match_rating: number | null;
}

export interface OtherProfile {
  id: string;
  name: string;
  role: string | null;
  organization: string | null;
  description: string | null;
  objectives: string | null;
  looking_for: string | null;
  can_offer: string | null;
  niche: string | null;
  website: string | null;
  linkedin: string | null;
  avg_match_rating: number | null;
}

export type CreatorType = "newsletter" | "other";

export interface Match {
  creatorId: string;
  creatorType: CreatorType;
  creatorName: string;
  newsletter?: NewsletterProfile;
  otherProfile?: OtherProfile;
  score: number;
  reasoning: string;
  concerns?: string;
  nicheDistance?: number;
}

function budgetToCents(budgetRange: string | null): number {
  switch (budgetRange) {
    case "<500": case "<$500": return 50000;
    case "500-1000": case "$500-$1k": return 100000;
    case "1000-2500": case "$1k-$2.5k": return 250000;
    case "2500-5000": case "$2.5k-$5k": return 500000;
    case "5000+": case "$5k+": return Infinity;
    default: return 0;
  }
}

// Engagement quality score for pre-ranking (higher = better)
function engagementScore(nl: Record<string, unknown>): number {
  const subs = (nl.subscriber_count as number) || 0;
  const openRate = (nl.avg_open_rate as number) || 0;
  return subs * (openRate > 0 ? openRate : 0.2);
}

// Multi-factor pre-ranking score (0-1 range, approximate)
// Combines engagement, niche proximity, verification, and rating
function preRankingScore(
  profile: Record<string, unknown>,
  candidateType: CreatorType,
  businessNiche: string | null
): number {
  let score = 0;

  // 1. Engagement (40% weight) — log-scaled effective reach
  if (candidateType === "newsletter") {
    const eng = engagementScore(profile);
    // Log scale: 1000 reach → 0.2, 10k → 0.4, 100k → 0.6, 1M → 0.8
    const engNormalized = Math.min(1, Math.log10(Math.max(eng, 1)) / 6);
    score += engNormalized * 0.4;
  } else {
    // Other creators: baseline engagement weight
    score += 0.2;
  }

  // 2. Niche proximity (30% weight)
  const candidateNiche = (profile.primary_niche || profile.niche) as string | null;
  const distance = getNicheDistance(businessNiche, candidateNiche);
  const proximityScore =
    distance === 0 ? 1.0 :
    distance === 1 ? 0.75 :
    distance === 2 ? 0.5 :
    distance === 3 ? 0.3 : 0.1;
  score += proximityScore * 0.3;

  // 3. Verification (15% weight)
  const verified = profile.verification_status === "api_verified"
    ? 1.0
    : profile.verification_status === "screenshot" ? 0.7 : 0;
  score += verified * 0.15;

  // 4. Average match rating (15% weight)
  const rating = (profile.avg_match_rating as number) || 0;
  const ratingScore = rating > 0 ? rating / 5 : 0.5; // neutral if no rating
  score += ratingScore * 0.15;

  return score;
}

export async function findMatchesForBusiness(
  businessId: string
): Promise<Match[]> {
  const supabase = createServiceClient();

  const { data: business, error: bizError } = await supabase
    .from("business_profiles")
    .select("*")
    .eq("id", businessId)
    .single();

  if (bizError || !business) {
    console.error("Failed to fetch business profile:", bizError);
    return [];
  }

  const maxBudgetCents = budgetToCents(business.budget_range);
  const preference = business.partner_preference || "all";

  // Learn from decline history — niches the business has declined 2+ times
  const insights = (business.preferences || {}) as Record<string, unknown>;
  const declinedNiches = (insights.declined_niches || {}) as Record<string, number>;
  const avoidNiches = new Set(
    Object.entries(declinedNiches)
      .filter(([, count]) => count >= 2)
      .map(([niche]) => niche)
  );

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  // Existing introductions (exclude duplicates)
  const { data: existingIntros } = await supabase
    .from("introductions")
    .select("newsletter_id, creator_id")
    .eq("business_id", businessId);

  const excludedIds = new Set<string>();
  for (const intro of existingIntros || []) {
    if (intro.newsletter_id) excludedIds.add(intro.newsletter_id);
    if (intro.creator_id) excludedIds.add(intro.creator_id);
  }

  const allCandidates: {
    type: CreatorType;
    profile: Record<string, unknown>;
    name: string;
    preScore: number;
    nicheDistance: number;
  }[] = [];

  // ── Newsletter candidates (cross-niche) ──
  if (preference === "all" || preference === "newsletters_only") {
    const searchNiches = getSearchNiches(business.primary_niche);

    const { data: newsletters } = await supabase
      .from("newsletter_profiles")
      .select("*")
      .in("primary_niche", searchNiches.length > 0 ? searchNiches : ["__none__"])
      .in("onboarding_status", ["fully_onboarded", "whatsapp_active", "widget_complete"]);

    if (newsletters) {
      // Rate limit check
      const nlIds = newsletters.map((nl: Record<string, unknown>) => nl.id as string);
      const { data: recentIntros } = await supabase
        .from("introductions")
        .select("newsletter_id")
        .in("newsletter_id", nlIds.length > 0 ? nlIds : ["__none__"])
        .gte("created_at", oneWeekAgo.toISOString());

      const introCounts = new Map<string, number>();
      for (const intro of recentIntros || []) {
        const id = intro.newsletter_id as string;
        introCounts.set(id, (introCounts.get(id) || 0) + 1);
      }

      for (const nl of newsletters) {
        const nlId = nl.id as string;
        if (excludedIds.has(nlId)) continue;
        if ((introCounts.get(nlId) || 0) >= 2) continue;
        const price = nl.price_per_placement as number | null;
        if (price && price > maxBudgetCents) continue;
        // Skip niches the business has repeatedly declined
        if (nl.primary_niche && avoidNiches.has(nl.primary_niche as string)) continue;

        allCandidates.push({
          type: "newsletter",
          profile: nl,
          name: nl.newsletter_name,
          preScore: preRankingScore(nl, "newsletter", business.primary_niche),
          nicheDistance: getNicheDistance(business.primary_niche, nl.primary_niche as string | null),
        });
      }
    }
  }

  // ── Other creator candidates (cross-niche) ──
  if (preference === "all" || preference === "creators_only") {
    const searchNiches = getSearchNiches(business.primary_niche);

    const { data: creators } = await supabase
      .from("other_profiles")
      .select("*")
      .eq("is_active", true)
      .in("niche", searchNiches.length > 0 ? searchNiches : ["__none__"]);

    if (creators) {
      const crIds = creators.map((cr: Record<string, unknown>) => cr.id as string);
      const { data: recentIntros } = await supabase
        .from("introductions")
        .select("creator_id")
        .eq("creator_type", "other")
        .in("creator_id", crIds.length > 0 ? crIds : ["__none__"])
        .gte("created_at", oneWeekAgo.toISOString());

      const introCounts = new Map<string, number>();
      for (const intro of recentIntros || []) {
        const id = intro.creator_id as string;
        introCounts.set(id, (introCounts.get(id) || 0) + 1);
      }

      for (const cr of creators) {
        const crId = cr.id as string;
        if (excludedIds.has(crId)) continue;
        if ((introCounts.get(crId) || 0) >= 2) continue;
        if (cr.niche && avoidNiches.has(cr.niche as string)) continue;

        allCandidates.push({
          type: "other",
          profile: cr,
          name: cr.name,
          preScore: preRankingScore(cr, "other", business.primary_niche),
          nicheDistance: getNicheDistance(business.primary_niche, cr.niche as string | null),
        });
      }
    }
  }

  if (allCandidates.length === 0) return [];

  // Pre-rank by multi-factor score, take top 8 for LLM scoring
  allCandidates.sort((a, b) => b.preScore - a.preScore);
  const topCandidates = allCandidates.slice(0, 8);

  // Get historical match success data for the scoring prompt
  let successContext = "";
  try {
    const { data: pastIntros } = await supabase
      .from("introductions")
      .select("status, match_score, newsletter_profiles(primary_niche), business_profiles(primary_niche)")
      .in("status", ["introduced", "completed", "business_declined", "newsletter_declined"])
      .limit(50);

    if (pastIntros && pastIntros.length > 5) {
      const nichePairs: Record<string, { deals: number; total: number }> = {};
      for (const intro of pastIntros) {
        const bizProf = intro.business_profiles as unknown as Record<string, unknown> | null;
        const nlProf = intro.newsletter_profiles as unknown as Record<string, unknown> | null;
        const bizNiche = (bizProf?.primary_niche as string) || "Unknown";
        const nlNiche = (nlProf?.primary_niche as string) || "Unknown";
        const key = `${bizNiche} → ${nlNiche}`;
        if (!nichePairs[key]) nichePairs[key] = { deals: 0, total: 0 };
        nichePairs[key].total++;
        if (intro.status === "introduced" || intro.status === "completed") {
          nichePairs[key].deals++;
        }
      }
      const topPairs = Object.entries(nichePairs)
        .filter(([, v]) => v.total >= 2)
        .sort((a, b) => (b[1].deals / b[1].total) - (a[1].deals / a[1].total))
        .slice(0, 5)
        .map(([pair, v]) => `${pair}: ${Math.round((v.deals / v.total) * 100)}% success (${v.total} matches)`)
        .join("\n");
      if (topPairs) {
        successContext = `\n\nHistorical niche pair success rates:\n${topPairs}`;
      }
    }
  } catch { /* non-critical */ }

  // Batch LLM scoring — one call for all candidates
  const scored = await batchScoreCandidates(business as BusinessProfile, topCandidates, successContext);

  // Sort by score, return top 3
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3);
}

// Score all candidates in a single LLM call
async function batchScoreCandidates(
  business: BusinessProfile,
  candidates: { type: CreatorType; profile: Record<string, unknown>; name: string; nicheDistance?: number }[],
  successContext: string = ""
): Promise<Match[]> {
  if (candidates.length === 0) return [];

  const candidateDescriptions = candidates.map((c, i) => {
    const distance = c.nicheDistance;
    const distanceLabel = distance === 0 ? "EXACT NICHE" :
                          distance === 1 ? "closely related" :
                          distance === 2 ? "related" :
                          distance === 3 ? "loosely related" : "unrelated";
    if (c.type === "newsletter") {
      const nl = c.profile;
      const verified = nl.verification_status === "api_verified" ? " ✓ API-verified"
        : nl.verification_status === "screenshot" ? " ✓ screenshot-verified" : "";
      return `${i + 1}. [NEWSLETTER${verified}] ${nl.newsletter_name} (${distanceLabel}) | Niche: ${nl.primary_niche || "General"} | ${nl.subscriber_count || "?"} subs | ${nl.avg_open_rate || "?"}% open rate | ${nl.description || "N/A"}`;
    } else {
      const cr = c.profile;
      return `${i + 1}. [CREATOR] ${cr.name} (${distanceLabel}) | Niche: ${cr.niche || "General"} | Role: ${cr.role || "N/A"} | Offers: ${cr.can_offer || "N/A"} | ${cr.description || "N/A"}`;
    }
  }).join("\n");

  const prompt = `You are scoring candidates for a brand partnership. Be rigorous.

BUSINESS:
- Company: ${business.company_name}
- Product: ${business.product_description || "N/A"}
- Target customer: ${business.target_customer || "N/A"}
- Campaign goal: ${business.campaign_goal || "N/A"}
- Primary niche: ${business.primary_niche || "N/A"}
- Budget: ${business.budget_range || "N/A"}

CANDIDATES:
${candidateDescriptions}

SCORING RUBRIC (each 0.0-1.0, equal weight unless stated):
1. Audience-product fit: Would this audience actually care about the product?
2. Niche alignment: Exact niche = top score. Closely related = good. Loosely related = only if clear thematic fit.
3. Engagement quality: Newsletters with high open rates beat large-but-passive ones.
4. Campaign goal match: Brand awareness ≠ direct response. Match the intent.
5. Credibility: Verified creators score higher. No verification isn't disqualifying but it's a flag.

HARD RULES:
- If audience demographics clearly don't match the target customer, score below 0.4
- If campaign goal is "direct response" but the creator is known for brand content, note a concern
- Be honest. A mediocre match is 0.5, not 0.8.${successContext ? `\n\n${successContext}\nBoost candidates in niche pairs with high historical success.` : ""}

Return ONLY a JSON array. For each candidate, include:
- "index": candidate number
- "score": 0.0-1.0 overall weighted score
- "reasoning": ONE short sentence on why it works
- "concerns": ONE short sentence on potential issues, or null if none

[{"index":1,"score":0.85,"reasoning":"...","concerns":"..."},{"index":2,"score":0.6,"reasoning":"...","concerns":null}]`;

  try {
    const anthropic = getAnthropic();
    const completion = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    logApiUsage({
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      route: "matching",
      tokensIn: completion.usage?.input_tokens || 0,
      tokensOut: completion.usage?.output_tokens || 0,
    });

    const text = completion.content[0].type === "text" ? completion.content[0].text : "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("No JSON array in batch scoring response:", text);
      return [];
    }

    const scores = JSON.parse(jsonMatch[0]) as {
      index: number;
      score: number;
      reasoning: string;
      concerns?: string | null;
    }[];

    return scores
      .filter((s) => s.score > 0.4) // Raised threshold for higher quality
      .map((s) => {
        const candidate = candidates[s.index - 1];
        if (!candidate) return null;

        let adjustedScore = Math.max(0, Math.min(1, s.score));

        // Niche distance boost: exact match gets a meaningful edge
        if (candidate.nicheDistance === 0) adjustedScore = Math.min(1, adjustedScore * 1.15);
        else if (candidate.nicheDistance === 1) adjustedScore = Math.min(1, adjustedScore * 1.05);

        // Boost for verified/high-rated
        if (candidate.type === "newsletter") {
          if (candidate.profile.verification_status === "api_verified") adjustedScore = Math.min(1, adjustedScore * 1.1);
          else if (candidate.profile.verification_status === "screenshot") adjustedScore = Math.min(1, adjustedScore * 1.05);
          if ((candidate.profile.avg_match_rating as number) > 4.0) adjustedScore = Math.min(1, adjustedScore * 1.05);
        }

        const match: Match = {
          creatorId: candidate.profile.id as string,
          creatorType: candidate.type,
          creatorName: candidate.name,
          score: adjustedScore,
          reasoning: s.reasoning,
          concerns: s.concerns || undefined,
          nicheDistance: candidate.nicheDistance,
        };

        if (candidate.type === "newsletter") {
          match.newsletter = candidate.profile as unknown as NewsletterProfile;
        } else {
          match.otherProfile = candidate.profile as unknown as OtherProfile;
        }

        return match;
      })
      .filter(Boolean) as Match[];
  } catch (err) {
    console.error("Batch scoring error:", err);
    return [];
  }
}
