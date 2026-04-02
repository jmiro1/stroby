import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "./supabase";

// Lazy-loaded Anthropic client
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

// Map budget range strings to max cents
function budgetToCents(budgetRange: string | null): number {
  switch (budgetRange) {
    case "<500":
    case "<$500":
      return 50000;
    case "500-1000":
    case "$500-$1k":
      return 100000;
    case "1000-2500":
    case "$1k-$2.5k":
      return 250000;
    case "2500-5000":
    case "$2.5k-$5k":
      return 500000;
    case "5000+":
    case "$5k+":
      return Infinity;
    default:
      return 0;
  }
}

export async function findMatchesForBusiness(
  businessId: string
): Promise<Match[]> {
  const supabase = createServiceClient();

  // Fetch the business profile
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

  // Rate limit: max 2 intro requests per creator per week
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  // Existing introductions for this business (to exclude duplicates)
  const { data: existingIntros } = await supabase
    .from("introductions")
    .select("newsletter_id, creator_id, creator_type")
    .eq("business_id", businessId);

  const excludedNewsletterIds = new Set<string>();
  const excludedCreatorIds = new Set<string>();
  for (const intro of existingIntros || []) {
    if (intro.newsletter_id) excludedNewsletterIds.add(intro.newsletter_id);
    if (intro.creator_id) excludedCreatorIds.add(intro.creator_id);
  }

  const allMatches: Match[] = [];

  // ── Newsletter matches ──
  if (preference === "all" || preference === "newsletters_only") {
    const { data: newsletters, error: nlError } = await supabase
      .from("newsletter_profiles")
      .select("*")
      .eq("primary_niche", business.primary_niche)
      .in("onboarding_status", ["fully_onboarded", "whatsapp_active", "widget_complete"]);

    if (!nlError && newsletters) {
      // Filter by budget
      const affordable = newsletters.filter((nl: Record<string, unknown>) => {
        const price = nl.price_per_placement as number | null;
        if (!price) return true;
        return price <= maxBudgetCents;
      });

      // Check weekly rate limits for newsletters
      const nlIds = affordable.map((nl: Record<string, unknown>) => nl.id as string);
      const { data: recentNlIntros } = await supabase
        .from("introductions")
        .select("newsletter_id")
        .in("newsletter_id", nlIds.length > 0 ? nlIds : ["__none__"])
        .gte("created_at", oneWeekAgo.toISOString());

      const nlIntroCounts = new Map<string, number>();
      for (const intro of recentNlIntros || []) {
        const id = intro.newsletter_id as string;
        nlIntroCounts.set(id, (nlIntroCounts.get(id) || 0) + 1);
      }

      const candidates = affordable.filter((nl: Record<string, unknown>) => {
        const nlId = nl.id as string;
        if (excludedNewsletterIds.has(nlId) || excludedCreatorIds.has(nlId)) return false;
        if ((nlIntroCounts.get(nlId) || 0) >= 2) return false;
        return true;
      });

      for (const candidate of candidates) {
        const { score, reasoning } = await scoreNewsletterMatch(
          business as BusinessProfile,
          candidate as NewsletterProfile
        );

        let adjustedScore = score;
        if (candidate.api_verified) adjustedScore *= 1.15;
        if (candidate.avg_match_rating && (candidate.avg_match_rating as number) > 4.0) {
          adjustedScore *= 1.1;
        }
        adjustedScore = Math.min(adjustedScore, 1.0);

        allMatches.push({
          creatorId: candidate.id,
          creatorType: "newsletter",
          creatorName: candidate.newsletter_name,
          newsletter: candidate as NewsletterProfile,
          score: adjustedScore,
          reasoning,
        });
      }
    }
  }

  // ── Other creator/influencer matches ──
  if (preference === "all" || preference === "creators_only") {
    let query = supabase
      .from("other_profiles")
      .select("*")
      .eq("is_active", true);

    // Match on niche if available
    if (business.primary_niche) {
      query = query.eq("niche", business.primary_niche);
    }

    const { data: creators, error: crError } = await query;

    if (!crError && creators) {
      // Check weekly rate limits for other creators
      const crIds = creators.map((cr: Record<string, unknown>) => cr.id as string);
      const { data: recentCrIntros } = await supabase
        .from("introductions")
        .select("creator_id")
        .eq("creator_type", "other")
        .in("creator_id", crIds.length > 0 ? crIds : ["__none__"])
        .gte("created_at", oneWeekAgo.toISOString());

      const crIntroCounts = new Map<string, number>();
      for (const intro of recentCrIntros || []) {
        const id = intro.creator_id as string;
        crIntroCounts.set(id, (crIntroCounts.get(id) || 0) + 1);
      }

      const candidates = creators.filter((cr: Record<string, unknown>) => {
        const crId = cr.id as string;
        if (excludedCreatorIds.has(crId)) return false;
        if ((crIntroCounts.get(crId) || 0) >= 2) return false;
        return true;
      });

      for (const candidate of candidates) {
        const { score, reasoning } = await scoreCreatorMatch(
          business as BusinessProfile,
          candidate as OtherProfile
        );

        let adjustedScore = score;
        if (candidate.avg_match_rating && (candidate.avg_match_rating as number) > 4.0) {
          adjustedScore *= 1.1;
        }
        adjustedScore = Math.min(adjustedScore, 1.0);

        allMatches.push({
          creatorId: candidate.id,
          creatorType: "other",
          creatorName: candidate.name,
          otherProfile: candidate as OtherProfile,
          score: adjustedScore,
          reasoning,
        });
      }
    }
  }

  // Sort by score descending and return top 3
  allMatches.sort((a, b) => b.score - a.score);
  return allMatches.slice(0, 3);
}

export async function scoreNewsletterMatch(
  business: BusinessProfile,
  newsletter: NewsletterProfile
): Promise<{ score: number; reasoning: string }> {
  const anthropic = getAnthropic();

  const prompt = `You are a sponsorship matching scorer. Evaluate how well this business and newsletter match for a paid sponsorship placement.

Business:
- Company: ${business.company_name}
- Product: ${business.product_description || "N/A"}
- Target customer: ${business.target_customer || "N/A"}
- Campaign goal: ${business.campaign_goal || "N/A"}
- Description: ${business.description || "N/A"}

Newsletter:
- Name: ${newsletter.newsletter_name}
- Niche: ${newsletter.primary_niche || "N/A"}
- Description: ${newsletter.description || "N/A"}
- Subscribers: ${newsletter.subscriber_count || "N/A"}
- Avg open rate: ${newsletter.avg_open_rate ? `${newsletter.avg_open_rate}%` : "N/A"}
- Avg CTR: ${newsletter.avg_ctr ? `${newsletter.avg_ctr}%` : "N/A"}

Score this match from 0.0 to 1.0 based on audience relevance, engagement quality, and campaign goal alignment.

Respond ONLY with valid JSON, no other text:
{"score": 0.0, "reasoning": "one sentence explanation"}`;

  return callScorer(prompt);
}

export async function scoreCreatorMatch(
  business: BusinessProfile,
  creator: OtherProfile
): Promise<{ score: number; reasoning: string }> {
  const anthropic = getAnthropic();

  const prompt = `You are a brand partnership matching scorer. Evaluate how well this business and influencer/creator match for a paid partnership.

Business:
- Company: ${business.company_name}
- Product: ${business.product_description || "N/A"}
- Target customer: ${business.target_customer || "N/A"}
- Campaign goal: ${business.campaign_goal || "N/A"}
- Description: ${business.description || "N/A"}

Influencer/Creator:
- Name: ${creator.name}
- Role: ${creator.role || "N/A"}
- Organization: ${creator.organization || "N/A"}
- Niche: ${creator.niche || "N/A"}
- Description: ${creator.description || "N/A"}
- What they offer: ${creator.can_offer || "N/A"}
- Objectives: ${creator.objectives || "N/A"}
- Website: ${creator.website || "N/A"}

Score this match from 0.0 to 1.0 based on audience relevance, creator credibility, and campaign goal alignment.

Respond ONLY with valid JSON, no other text:
{"score": 0.0, "reasoning": "one sentence explanation"}`;

  return callScorer(prompt);
}

async function callScorer(
  prompt: string
): Promise<{ score: number; reasoning: string }> {
  const anthropic = getAnthropic();

  try {
    const completion = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      completion.content[0].type === "text" ? completion.content[0].text : "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("No JSON found in scoring response:", text);
      return { score: 0, reasoning: "Scoring failed" };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      score: Math.max(0, Math.min(1, Number(parsed.score) || 0)),
      reasoning: String(parsed.reasoning || "No reasoning provided"),
    };
  } catch (err) {
    console.error("Match scoring error:", err);
    return { score: 0, reasoning: "Scoring failed due to an error" };
  }
}
