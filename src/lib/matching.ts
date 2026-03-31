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

export interface Match {
  newsletter: NewsletterProfile;
  score: number;
  reasoning: string;
}

// Map budget range strings to max cents
function budgetToCents(budgetRange: string | null): number {
  switch (budgetRange) {
    case "<$500":
      return 50000;
    case "$500-$1k":
      return 100000;
    case "$1k-$2.5k":
      return 250000;
    case "$2.5k-$5k":
      return 500000;
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

  // Query active newsletters in the same niche
  let query = supabase
    .from("newsletter_profiles")
    .select("*")
    .eq("primary_niche", business.primary_niche)
    .in("onboarding_status", [
      "fully_onboarded",
      "whatsapp_active",
      "widget_complete",
    ]);

  const { data: newsletters, error: nlError } = await query;

  if (nlError || !newsletters || newsletters.length === 0) {
    return [];
  }

  // Filter by budget: newsletter price must be within business budget
  const affordableNewsletters = newsletters.filter(
    (nl: Record<string, unknown>) => {
      const price = nl.price_per_placement as number | null;
      if (!price) return true; // Include newsletters without pricing (can be negotiated)
      return price <= maxBudgetCents;
    }
  );

  // Exclude newsletters already introduced to this business
  const { data: existingIntros } = await supabase
    .from("introductions")
    .select("newsletter_id")
    .eq("business_id", businessId);

  const excludedIds = new Set(
    (existingIntros || []).map(
      (intro: Record<string, unknown>) => intro.newsletter_id as string
    )
  );

  const candidates = affordableNewsletters.filter(
    (nl: Record<string, unknown>) => !excludedIds.has(nl.id as string)
  );

  if (candidates.length === 0) {
    return [];
  }

  // Score each candidate with LLM
  const scored: Match[] = [];
  for (const candidate of candidates) {
    const { score, reasoning } = await scoreMatch(
      business as BusinessProfile,
      candidate as NewsletterProfile
    );

    let adjustedScore = score;

    // Boost for API-verified newsletters
    if (candidate.api_verified) {
      adjustedScore *= 1.15;
    }

    // Boost for high-rated newsletters
    if (
      candidate.avg_match_rating &&
      (candidate.avg_match_rating as number) > 4.0
    ) {
      adjustedScore *= 1.1;
    }

    // Cap at 1.0
    adjustedScore = Math.min(adjustedScore, 1.0);

    scored.push({
      newsletter: candidate as NewsletterProfile,
      score: adjustedScore,
      reasoning,
    });
  }

  // Sort by score descending and return top 3
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3);
}

export async function scoreMatch(
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

  try {
    const completion = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      completion.content[0].type === "text" ? completion.content[0].text : "";

    // Extract JSON from the response
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
