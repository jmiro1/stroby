/**
 * Production matching engine entry point.
 *
 * Migrated 2026-04-28 to delegate scoring + LLM reasoning to the
 * intelligence engine in `lib/intelligence/matching.ts`. This file now
 * exists only to:
 *   1. Apply the production-side guards the intelligence engine doesn't
 *      know about (rate limits, declined-niche tracking, exclude
 *      already-introduced creators).
 *   2. Adapt the intelligence engine's output to the legacy `Match[]`
 *      shape consumers (the cron job + WhatsApp introduction templates)
 *      already depend on.
 *
 * Pre-migration this file was ~1500 lines with its own pre-ranking +
 * Haiku batch scoring. All of that lives in `intelligence/matching.ts`
 * now (with embedding-based cosine similarity, safety-charge filters,
 * the LLM rerank, and the match-eligibility gate).
 *
 * 2026-04-29: other_profiles support restored. The intelligence engine
 * now reads creator_directory_unified (newsletter + other UNION'd) and
 * surfaces match.creator_type='newsletter'|'other'. This wrapper
 * branches on creator_type to populate either `newsletter` or
 * `otherProfile` on Match for downstream WhatsApp templating.
 */
import { createServiceClient } from "./supabase";

// ── Public types (kept stable for consumers) ──

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

// ── Production guards ──
// These belong here (not in the intelligence engine) because they're
// about production introductions state — rate limits, decline history,
// duplicates — not about scoring per se. The intelligence engine is a
// pure ranker; this wrapper layers production policy on top.

const RATE_LIMIT_PER_CREATOR_PER_WEEK = 2;
const MIN_SCORE_THRESHOLD = 0.3;     // below this, even the top result isn't worth surfacing
const MAX_RESULTS = 3;                // top-N returned to the caller (cron sends one intro at a time)

/**
 * Find the top creator matches for a real, match-eligible business.
 *
 * Returns [] when:
 *   - business doesn't exist or isn't active
 *   - business profile is not match_eligible (the intelligence engine returns
 *     a profile_incomplete sentinel; the cron logs it and skips)
 *   - all eligible creators are filtered out by the production guards
 *
 * Consumers (cron, /api/admin/trigger-match) treat [] as "no good match
 * this run" — they don't error.
 */
export async function findMatchesForBusiness(businessId: string): Promise<Match[]> {
  const supabase = createServiceClient();

  // Production-side state we still need: existing introductions for
  // dedup, recent introductions for rate limit, declined-niche history.
  const { data: business } = await supabase
    .from("business_profiles")
    .select("id, primary_niche, partner_preference, preferences")
    .eq("id", businessId)
    .single();

  if (!business) return [];

  const insights = (business.preferences || {}) as Record<string, unknown>;
  const declinedNiches = (insights.declined_niches || {}) as Record<string, number>;
  const avoidNiches = new Set(
    Object.entries(declinedNiches)
      .filter(([, count]) => (count as number) >= 2)
      .map(([niche]) => niche)
  );

  // Already-introduced creators (any time, any status) — never repeat
  const { data: existingIntros } = await supabase
    .from("introductions")
    .select("newsletter_id, creator_id")
    .eq("business_id", businessId);
  const excludedIds = new Set<string>();
  for (const intro of existingIntros || []) {
    if (intro.newsletter_id) excludedIds.add(intro.newsletter_id);
    if (intro.creator_id) excludedIds.add(intro.creator_id);
  }

  // Rate limit: a creator can be introduced to ≤N businesses per week.
  // Protects creators from inbox spam when the matching engine likes them.
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const { data: recentIntros } = await supabase
    .from("introductions")
    .select("newsletter_id, creator_id")
    .gte("created_at", oneWeekAgo.toISOString());
  const introCounts = new Map<string, number>();
  for (const intro of recentIntros || []) {
    for (const id of [intro.newsletter_id, intro.creator_id]) {
      if (id) introCounts.set(id, (introCounts.get(id) || 0) + 1);
    }
  }

  // ── Delegate scoring + LLM rerank to the intelligence engine ──
  // It applies the eligibility gate, computes embeddings cosine, runs the
  // top-50 → Sonnet/Haiku rerank, and surfaces specific reasoning.
  const { getMatchesForBrand } = await import("./intelligence/matching");
  const result = await getMatchesForBrand(businessId, 50);

  // Profile-incomplete sentinel — caller's profile doesn't clear the
  // eligibility bar. Log it so ops knows; return [] to consumers.
  if (!Array.isArray(result)) {
    const r = result as { match_eligibility_score?: number; missing_fields?: string[] };
    console.info(
      `findMatchesForBusiness: ${businessId} profile_incomplete (score=${r.match_eligibility_score}); missing=[${(r.missing_fields || []).join(", ")}]`
    );
    return [];
  }

  // First pass: filter by production guards. We collect candidates BEFORE
  // doing the otherProfile fetch so we only pay for rows that survive.
  type Candidate = {
    creatorId: string;
    creatorType: CreatorType;
    score: number;
    niche: string | null;
    creatorName: string;
    audienceReach: number | null;
    pricePerPlacement: number | null;
    reasoning: string;
  };
  const surviving: Candidate[] = [];
  for (const m of result) {
    const mr = m as Record<string, unknown>;
    const creatorId = mr.creator_id as string;
    const score = mr.score as number;

    if (!creatorId) continue;
    if (typeof score !== "number" || score < MIN_SCORE_THRESHOLD) continue;
    if (excludedIds.has(creatorId)) continue;
    if ((introCounts.get(creatorId) || 0) >= RATE_LIMIT_PER_CREATOR_PER_WEEK) continue;
    const niche = (mr.primary_niche as string) || null;
    if (niche && avoidNiches.has(niche)) continue;

    const creatorType = ((mr.creator_type as string) === "other" ? "other" : "newsletter") as CreatorType;
    surviving.push({
      creatorId,
      creatorType,
      score,
      niche,
      creatorName: (mr.creator_name as string) || "Creator",
      audienceReach: (mr.audience_reach as number) || null,
      pricePerPlacement: (mr.price_per_placement as number) || null,
      reasoning:
        (mr.llm_reasoning as string)
        || (mr.explanation as string)
        || `${Math.round(score * 100)}% match`,
    });

    if (surviving.length >= MAX_RESULTS) break;
  }

  if (surviving.length === 0) return [];

  // For any "other" creators in the survivor list, fetch the rich
  // OtherProfile fields (role, organization, can_offer, ...) so the
  // WhatsApp introduction template has what it needs. Newsletter rows
  // can be populated from the unified-view fields we already have.
  const otherIds = surviving.filter(c => c.creatorType === "other").map(c => c.creatorId);
  const otherById = new Map<string, OtherProfile>();
  if (otherIds.length > 0) {
    const { data: rows } = await supabase
      .from("other_profiles")
      .select("id, name, role, organization, description, objectives, looking_for, can_offer, niche, website, linkedin")
      .in("id", otherIds);
    for (const r of rows || []) {
      otherById.set(r.id as string, {
        id: r.id as string,
        name: (r.name as string) || "",
        role: (r.role as string) || null,
        organization: (r.organization as string) || null,
        description: (r.description as string) || null,
        objectives: (r.objectives as string) || null,
        looking_for: (r.looking_for as string) || null,
        can_offer: (r.can_offer as string) || null,
        niche: (r.niche as string) || null,
        website: (r.website as string) || null,
        linkedin: (r.linkedin as string) || null,
        avg_match_rating: null,
      });
    }
  }

  return surviving.map<Match>(c => {
    if (c.creatorType === "other") {
      return {
        creatorId: c.creatorId,
        creatorType: "other",
        creatorName: c.creatorName,
        otherProfile: otherById.get(c.creatorId) || {
          id: c.creatorId,
          name: c.creatorName,
          role: null,
          organization: null,
          description: null,
          objectives: null,
          looking_for: null,
          can_offer: null,
          niche: c.niche,
          website: null,
          linkedin: null,
          avg_match_rating: null,
        },
        reasoning: c.reasoning,
        score: c.score,
      };
    }
    return {
      creatorId: c.creatorId,
      creatorType: "newsletter",
      creatorName: c.creatorName,
      newsletter: {
        id: c.creatorId,
        slug: null,
        newsletter_name: c.creatorName,
        primary_niche: c.niche,
        description: null,
        subscriber_count: c.audienceReach,
        avg_open_rate: null,
        avg_ctr: null,
        price_per_placement: c.pricePerPlacement,
        api_verified: null,
        screenshot_verified: null,
        avg_match_rating: null,
      },
      reasoning: c.reasoning,
      score: c.score,
    };
  });
}
