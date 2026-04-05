import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "./supabase";
import { getSearchNiches } from "./niche-affinity";

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
  // Effective reach = subscribers × open rate (normalized)
  return subs * (openRate > 0 ? openRate : 0.2); // assume 20% if unknown
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

  const allCandidates: { type: CreatorType; profile: Record<string, unknown>; name: string; engScore: number }[] = [];

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
          engScore: engagementScore(nl),
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
          engScore: 0, // No engagement metrics for other profiles
        });
      }
    }
  }

  if (allCandidates.length === 0) return [];

  // Pre-rank by engagement score, take top 8 for LLM scoring
  allCandidates.sort((a, b) => b.engScore - a.engScore);
  const topCandidates = allCandidates.slice(0, 8);

  // Batch LLM scoring — one call for all candidates
  const scored = await batchScoreCandidates(business as BusinessProfile, topCandidates);

  // Sort by score, return top 3
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3);
}

// Score all candidates in a single LLM call
async function batchScoreCandidates(
  business: BusinessProfile,
  candidates: { type: CreatorType; profile: Record<string, unknown>; name: string }[]
): Promise<Match[]> {
  if (candidates.length === 0) return [];

  const candidateDescriptions = candidates.map((c, i) => {
    if (c.type === "newsletter") {
      const nl = c.profile;
      return `${i + 1}. [NEWSLETTER] ${nl.newsletter_name} | Niche: ${nl.primary_niche || "General"} | ${nl.subscriber_count || "?"} subs | ${nl.avg_open_rate || "?"}% open rate | ${nl.description || "N/A"}`;
    } else {
      const cr = c.profile;
      return `${i + 1}. [CREATOR] ${cr.name} | Niche: ${cr.niche || "General"} | Role: ${cr.role || "N/A"} | Offers: ${cr.can_offer || "N/A"} | ${cr.description || "N/A"}`;
    }
  }).join("\n");

  const prompt = `Score these candidates for a brand partnership with this business. Return a JSON array.

Business:
- ${business.company_name}: ${business.product_description || "N/A"}
- Target: ${business.target_customer || "N/A"}
- Goal: ${business.campaign_goal || "N/A"}
- Niche: ${business.primary_niche || "N/A"}

Candidates:
${candidateDescriptions}

Score each 0.0-1.0. Consider: audience relevance, niche fit (related niches count), engagement quality, campaign goal alignment.

Respond ONLY with valid JSON array, no other text:
[{"index":1,"score":0.85,"reasoning":"one sentence"},{"index":2,"score":0.6,"reasoning":"one sentence"}]`;

  try {
    const anthropic = getAnthropic();
    const completion = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const text = completion.content[0].type === "text" ? completion.content[0].text : "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("No JSON array in batch scoring response:", text);
      return [];
    }

    const scores = JSON.parse(jsonMatch[0]) as { index: number; score: number; reasoning: string }[];

    return scores
      .filter((s) => s.score > 0.3) // Min threshold
      .map((s) => {
        const candidate = candidates[s.index - 1];
        if (!candidate) return null;

        let adjustedScore = Math.max(0, Math.min(1, s.score));

        // Boost for verified/high-rated
        if (candidate.type === "newsletter") {
          if (candidate.profile.api_verified) adjustedScore = Math.min(1, adjustedScore * 1.1);
          if ((candidate.profile.avg_match_rating as number) > 4.0) adjustedScore = Math.min(1, adjustedScore * 1.05);
        }

        const match: Match = {
          creatorId: candidate.profile.id as string,
          creatorType: candidate.type,
          creatorName: candidate.name,
          score: adjustedScore,
          reasoning: s.reasoning,
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
