/**
 * GET /api/admin/top-pairs?min_score=0.55&limit=100&brand_niche=...&creator_niche=...
 *
 * Cross-brand × cross-creator top-pairs view. Returns the highest-scoring
 * (brand, creator) match pairs across the whole DB — for hyper-targeted
 * concierge outreach that lands well on BOTH ends of every introduction.
 *
 * Where `/api/admin/preview-matches` answers "what are this brand's
 * matches?", this route answers "what are the best 100 matches across
 * the entire platform right now?" — letting you prioritize concierge
 * by mutual-fit quality across the whole funnel.
 *
 * Algorithm:
 *   1. Pull all eligible brands with brand_intelligence + embeddings (up
 *      to a cap)
 *   2. Pull all eligible creators with embeddings (up to a cap, ordered
 *      by audience_reach so big-audience candidates make it in)
 *   3. Compute cosine similarity for every brand × creator pair in JS
 *   4. For pairs with cosine ≥ 0.5 (rough pre-filter), run the full
 *      production `scoreMatch` (factors + safety/competitor/vibe
 *      multipliers + active-component normalization)
 *   5. Filter to score ≥ min_score, sort globally, return top N with
 *      contact details + claim URL + draft cold-outreach message
 *
 * Latency: ~5-20s for default caps. Within the 60s function ceiling.
 *
 * Auth: admin (Bearer or ?key=).
 */
import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthed } from "@/lib/admin-auth";
import { scoreMatch } from "@/lib/intelligence/matching";
import { signClaimToken } from "@/lib/shadow/tokens";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_MIN_SCORE = 0.55;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const COSINE_PREFILTER = 0.5; // rough cosine cut before full scoring
const BRAND_POOL_CAP = 500;
const CREATOR_POOL_CAP = 1000;

function isShadowEmail(email: string | null | undefined): boolean {
  if (!email) return true;
  return /@shadow\.stroby\.ai$/i.test(email);
}

function stripControl(s: string): string {
  return s.replace(/[\x00-\x08\x0b-\x1f]/g, "");
}

function parseEmbedding(raw: unknown): number[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw === "string") {
    try {
      // pgvector serializes as "[0.1,0.2,...]"
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function buildDraft(args: {
  brandName: string;
  brandPitch: string;
  budgetRange: string | null;
  ownerFirst: string;
  newsletterName: string;
  reasoning: string | undefined;
  claimUrl: string;
  reach: number | null;
  audienceTerm: string;
  niche: string | null;
}): { subject: string; body: string } {
  const { brandName, brandPitch, budgetRange, ownerFirst, newsletterName, reasoning, claimUrl, reach, audienceTerm, niche } = args;

  const reachStr = reach
    ? reach >= 1_000_000 ? `${(reach / 1_000_000).toFixed(1)}M`
    : reach >= 1_000 ? `${Math.round(reach / 1_000)}K`
    : `${reach}`
    : null;

  const why = reasoning
    ? stripControl(reasoning).replace(/^\d+%\s*match\s*[—-]?\s*/i, "").trim()
    : `Your ${reachStr || "audience"} ${audienceTerm} in ${niche || "your space"} look like an exact fit for what we're building.`;

  const budget = budgetRange ? `Budget on our side: ${budgetRange}.` : "";

  const subject = `${brandName} would love to sponsor ${newsletterName}`;
  const body = [
    `Hi ${ownerFirst},`,
    ``,
    `I run ${brandName} — ${stripControl(brandPitch)}.`,
    ``,
    `${why}${budget ? " " + budget : ""}`,
    ``,
    `Quickest way to chat is on Stroby (the matchmaker that surfaced you to us). One-tap claim of your profile here:`,
    claimUrl,
    ``,
    `If Stroby isn't your speed, just reply to this and we'll go direct.`,
    ``,
    `— ${brandName}`,
  ].join("\n");

  return { subject, body };
}

export async function GET(request: NextRequest) {
  if (!isAdminAuthed(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const minScore = Math.max(0, Math.min(1, parseFloat(url.searchParams.get("min_score") || `${DEFAULT_MIN_SCORE}`)));
  const limitRaw = parseInt(url.searchParams.get("limit") || `${DEFAULT_LIMIT}`, 10);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : DEFAULT_LIMIT, 1), MAX_LIMIT);
  const brandNicheFilter = url.searchParams.get("brand_niche");
  const creatorNicheFilter = url.searchParams.get("creator_niche");
  const minReach = parseInt(url.searchParams.get("min_reach") || "0", 10);
  const realOnly = url.searchParams.get("real_only") === "1";
  const cosFloor = parseFloat(url.searchParams.get("cos_floor") || `${COSINE_PREFILTER}`);

  const supabase = createServiceClient();

  // 1. Brand pool
  let brandQuery = supabase
    .from("business_profiles_all")
    .select("id, company_name, primary_niche, onboarding_status, budget_range, campaign_outcome, brand_intelligence, profile_embedding")
    .eq("match_eligible", true)
    .not("profile_embedding", "is", null)
    .not("brand_intelligence", "is", null)
    .limit(BRAND_POOL_CAP);
  if (brandNicheFilter) brandQuery = brandQuery.eq("primary_niche", brandNicheFilter);
  if (realOnly) brandQuery = brandQuery.neq("onboarding_status", "shadow");

  const { data: brands, error: brandErr } = await brandQuery;
  if (brandErr) return Response.json({ error: `brand query: ${brandErr.message}` }, { status: 500 });
  if (!brands?.length) return Response.json({ pairs: [], message: "no eligible brands match filters" });

  // 2. Creator pool — ordered by audience_reach desc so big-audience
  //    creators are guaranteed in even when we cap at CREATOR_POOL_CAP.
  let creatorQuery = supabase
    .from("creator_directory_unified")
    .select("id, creator_type, creator_name, primary_niche, audience_reach, engagement_rate, avg_open_rate, price_per_placement, content_intelligence, profile_embedding")
    .eq("match_eligible", true)
    .eq("is_active", true)
    .not("profile_embedding", "is", null)
    .order("audience_reach", { ascending: false, nullsFirst: false })
    .limit(CREATOR_POOL_CAP);
  if (creatorNicheFilter) creatorQuery = creatorQuery.eq("primary_niche", creatorNicheFilter);
  if (minReach > 0) creatorQuery = creatorQuery.gte("audience_reach", minReach);

  const { data: creators, error: cErr } = await creatorQuery;
  if (cErr) return Response.json({ error: `creator query: ${cErr.message}` }, { status: 500 });
  if (!creators?.length) return Response.json({ pairs: [], message: "no eligible creators match filters" });

  // 3. Parse embeddings once per side
  const brandEmbs: Array<{ row: typeof brands[number]; emb: number[] }> = [];
  for (const b of brands) {
    const emb = parseEmbedding(b.profile_embedding);
    if (emb) brandEmbs.push({ row: b, emb });
  }
  const creatorEmbs: Array<{ row: typeof creators[number]; emb: number[] }> = [];
  for (const c of creators) {
    const emb = parseEmbedding(c.profile_embedding);
    if (emb) creatorEmbs.push({ row: c, emb });
  }

  // 4. Cosine pre-filter — for each brand, find creators with cosine ≥ floor.
  //    Cheap dot product (~1.5K ops per pair). 500 × 1000 = 500K pairs ≈ 1s.
  type Candidate = { brand: typeof brands[number]; creator: typeof creators[number]; cos: number };
  const candidates: Candidate[] = [];
  for (const b of brandEmbs) {
    for (const c of creatorEmbs) {
      const cos = cosineSim(b.emb, c.emb);
      if (cos >= cosFloor) {
        candidates.push({ brand: b.row, creator: c.row, cos });
      }
    }
  }

  // 5. Full scoreMatch on each survivor (factors + multipliers).
  type Scored = { brand: typeof brands[number]; creator: typeof creators[number]; score: number; explanation: string; cos: number };
  const scored: Scored[] = [];
  for (const cand of candidates) {
    const creatorWithName = { ...cand.creator, newsletter_name: cand.creator.creator_name };
    const result = scoreMatch(
      creatorWithName as unknown as Record<string, unknown>,
      cand.brand as unknown as Record<string, unknown>,
    );
    if (result.score >= minScore) {
      scored.push({
        brand: cand.brand,
        creator: cand.creator,
        score: result.score,
        explanation: result.explanation,
        cos: cand.cos,
      });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit);

  if (top.length === 0) {
    return Response.json({
      filters: { minScore, limit, brandNicheFilter, creatorNicheFilter, minReach: minReach || null, realOnly, cosFloor },
      brand_pool: brands.length,
      creator_pool: creators.length,
      cosine_survivors: candidates.length,
      pairs_above_threshold: 0,
      pairs: [],
    });
  }

  // 6. Hydrate creator contact details + build claim URLs + draft messages.
  const creatorIds = Array.from(new Set(top.map((s) => s.creator.id)));
  const { data: details } = await supabase
    .from("newsletter_profiles_all")
    .select("id, newsletter_name, owner_name, email, url, slug, platform")
    .in("id", creatorIds);
  const detailById = new Map<string, Record<string, unknown>>();
  for (const d of details || []) detailById.set(d.id as string, d as Record<string, unknown>);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://stroby.ai";
  const out = top.map((s) => {
    const b = s.brand;
    const c = s.creator;
    const detail = detailById.get(c.id) || {};
    const intel = (b.brand_intelligence as Record<string, unknown>) || {};

    let claimUrl = `${appUrl}/creator/${detail.slug || c.id}`;
    let claimToken: string | undefined;
    try {
      claimToken = signClaimToken(c.id, "creator", 30);
      claimUrl = `${appUrl}/claim/${claimToken}`;
    } catch (e) {
      console.error("signClaimToken failed for", c.id, e);
    }

    const realEmail = !isShadowEmail(detail.email as string | null);
    const ownerFirst = ((detail.owner_name as string) || "").split(/\s+/)[0] || "there";
    const newsletterName = (detail.newsletter_name as string) || c.creator_name;
    const audienceTerm = c.creator_type === "newsletter" ? "subscribers" : "followers";
    const brandPitch =
      (intel.newsletter_fit_notes as string) ||
      (intel.one_line_need as string) ||
      (intel.product_category as string) ||
      "our product";

    const draft = buildDraft({
      brandName: b.company_name,
      brandPitch,
      budgetRange: b.budget_range,
      ownerFirst,
      newsletterName,
      reasoning: s.explanation,
      claimUrl,
      reach: c.audience_reach,
      audienceTerm,
      niche: c.primary_niche,
    });

    return {
      score: s.score,
      score_pct: Math.round(s.score * 100),
      cosine: Math.round(s.cos * 1000) / 1000,
      reasoning: stripControl(s.explanation),
      brand: {
        id: b.id,
        name: b.company_name,
        niche: b.primary_niche,
        budget_range: b.budget_range,
        outcome: b.campaign_outcome,
        status: b.onboarding_status,
      },
      creator: {
        id: c.id,
        type: c.creator_type,
        newsletter_name: newsletterName,
        owner_name: detail.owner_name || null,
        niche: c.primary_niche,
        audience_reach: c.audience_reach,
        engagement_rate: c.engagement_rate,
        avg_open_rate: c.avg_open_rate,
        price_per_placement: c.price_per_placement,
        url: detail.url || null,
        slug: detail.slug || null,
        platform: detail.platform || c.creator_type,
        email: detail.email || null,
        has_real_email: realEmail,
      },
      claim_url: claimUrl,
      claim_token: claimToken,
      draft_subject: draft.subject,
      draft_body: draft.body,
    };
  });

  return Response.json({
    filters: { min_score: minScore, limit, brand_niche: brandNicheFilter, creator_niche: creatorNicheFilter, min_reach: minReach || null, real_only: realOnly, cos_floor: cosFloor },
    brand_pool: brands.length,
    creator_pool: creators.length,
    cosine_survivors: candidates.length,
    pairs_above_threshold: scored.length,
    returned: out.length,
    pairs: out,
  });
}
