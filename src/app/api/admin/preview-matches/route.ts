/**
 * GET /api/admin/preview-matches?brand_id=<uuid>&limit=10
 *
 * Concierge / ops endpoint. Returns the top creator matches for a brand
 * with everything you need to manually broker an intro:
 *   - creator name, owner_name, niche, audience_reach, url
 *   - whether we have a real email vs the shadow-*@shadow.stroby.ai placeholder
 *   - match score + components (LLM rerank skipped — see ?rerank=1 to opt in)
 *   - pre-generated claim_url (`/claim/<HMAC-signed-token>`, 30-day TTL)
 *   - draft_message — short, channel-agnostic copy you can paste into
 *     email / Substack DM / LinkedIn / wherever
 *
 * Bypasses the requester-eligibility gate that `/api/intelligence/matches/brand`
 * enforces — useful for previewing matches for a partially-onboarded brand
 * (e.g. gatewayz at 57% complete) so you can do concierge outreach before
 * the brand has finished filling out its profile.
 *
 * Auth: same admin-auth as the rest of /api/admin/* (Bearer or ?key=).
 */
import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthed } from "@/lib/admin-auth";
import { scoreMatch } from "@/lib/intelligence/matching";
import { signClaimToken } from "@/lib/shadow/tokens";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LIMIT = 25;

function isShadowEmail(email: string | null | undefined): boolean {
  if (!email) return true;
  return /@shadow\.stroby\.ai$/i.test(email);
}

interface BrandRow {
  id: string;
  company_name: string;
  primary_niche: string | null;
  product_description: string | null;
  budget_range: string | null;
  campaign_outcome: string | null;
  preferred_creator_type: string | null;
  preferred_creator_size: string | null;
  brand_intelligence: Record<string, unknown> | null;
  profile_embedding: unknown;
}

interface CreatorRow {
  id: string;
  creator_type: string;
  creator_name: string;
  primary_niche: string | null;
  audience_reach: number | null;
  engagement_rate: number | null;
  avg_open_rate: number | null;
  price_per_placement: number | null;
  content_intelligence: Record<string, unknown> | null;
  profile_embedding: unknown;
  match_eligibility_score: number | null;
}

interface CreatorDetail {
  id: string;
  newsletter_name: string | null;
  owner_name: string | null;
  email: string | null;
  url: string | null;
  slug: string | null;
  platform: string | null;
}

function buildDraftMessage(args: {
  brand: BrandRow;
  creator: CreatorDetail;
  creatorRow: CreatorRow;
  reasoning: string | undefined;
  claimUrl: string;
}): { subject: string; body: string } {
  const { brand, creator, creatorRow, reasoning, claimUrl } = args;
  const brandName = brand.company_name;
  const ownerFirst = (creator.owner_name || "").split(/\s+/)[0] || "there";
  const newsletterName = creator.newsletter_name || creatorRow.creator_name;

  // Pull a short brand pitch — prefer the synthesized newsletter_fit_notes
  // / one_line_need from brand_intelligence; fall back to product_description.
  const intel = (brand.brand_intelligence as Record<string, unknown>) || {};
  const brandPitch =
    (intel.newsletter_fit_notes as string)
    || (intel.one_line_need as string)
    || (intel.product_category as string)
    || brand.product_description
    || `our product`;

  // Audience size in human-friendly form
  const reach = creatorRow.audience_reach;
  const reachStr = reach
    ? reach >= 1_000_000 ? `${(reach / 1_000_000).toFixed(1)}M`
    : reach >= 1_000 ? `${Math.round(reach / 1_000)}K`
    : `${reach}`
    : null;

  const audienceTerm = creatorRow.creator_type === "newsletter" ? "subscribers" : "followers";
  const sizeLine = reachStr ? `Your ${reachStr} ${audienceTerm} ` : "Your audience ";

  // Budget — use the brand's stored range, fall back to "fair offer"
  const budget = brand.budget_range
    ? `Budget on our side: ${brand.budget_range}.`
    : "";

  const subject = `${brandName} would love to sponsor ${newsletterName}`;

  const why = reasoning
    ? reasoning.replace(/^\d+%\s*match\s*[—-]?\s*/i, "").trim()
    : `${sizeLine}in ${creatorRow.primary_niche || "your space"} look like an exact fit for what we're building.`;

  const body = [
    `Hi ${ownerFirst},`,
    ``,
    `I run ${brandName} — ${brandPitch}.`,
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
  const brandId = url.searchParams.get("brand_id");
  const limitRaw = parseInt(url.searchParams.get("limit") || "10", 10);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 10, 1), MAX_LIMIT);

  if (!brandId || !UUID_RE.test(brandId)) {
    return Response.json({ error: "brand_id (UUID) required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 1. Read brand — NO eligibility check (that's the whole point of this route).
  const { data: brandRaw, error: brandErr } = await supabase
    .from("business_profiles_all")
    .select("id, company_name, primary_niche, product_description, budget_range, campaign_outcome, preferred_creator_type, preferred_creator_size, brand_intelligence, profile_embedding")
    .eq("id", brandId)
    .single();
  if (brandErr || !brandRaw) {
    return Response.json({ error: "brand not found" }, { status: 404 });
  }
  const brand = brandRaw as unknown as BrandRow;

  if (!brand.profile_embedding) {
    return Response.json({
      error: "brand has no profile_embedding — cosine similarity won't work. Backfill the brand's embedding first.",
      brand_id: brand.id,
      company_name: brand.company_name,
    }, { status: 412 });
  }

  // 2. Pull eligible creator candidates (the same query the production
  //    engine uses, minus the requester-side eligibility check).
  const { data: creators, error: cErr } = await supabase
    .from("creator_directory_unified")
    .select("id, creator_type, platform, creator_name, primary_niche, audience_reach, engagement_rate, avg_open_rate, price_per_placement, content_intelligence, profile_embedding, onboarding_status, match_eligibility_score")
    .eq("is_active", true)
    .eq("match_eligible", true)
    .not("profile_embedding", "is", null);
  if (cErr || !creators?.length) {
    return Response.json({
      brand_id: brand.id,
      company_name: brand.company_name,
      matches: [],
      message: cErr ? `creator query failed: ${cErr.message}` : "no eligible creators",
    });
  }

  // 3. Score each via the production scoreMatch function.
  type Scored = {
    creator: CreatorRow;
    score: number;
    explanation: string;
    components: Record<string, number>;
  };
  const scored: Scored[] = [];
  for (const c of creators) {
    const cRow = { ...c, newsletter_name: c.creator_name } as unknown as CreatorRow & { newsletter_name: string };
    const result = scoreMatch(cRow as unknown as Record<string, unknown>, brand as unknown as Record<string, unknown>);
    scored.push({
      creator: c as unknown as CreatorRow,
      score: result.score,
      explanation: result.explanation,
      components: result.components,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit);

  // 4. Fetch full contact details for the top N (newsletter_profiles_all
  //    only — other_profiles has different fields, skip for v1).
  const topIds = top.map((s) => s.creator.id);
  const { data: details } = await supabase
    .from("newsletter_profiles_all")
    .select("id, newsletter_name, owner_name, email, url, slug, platform")
    .in("id", topIds);
  const detailById = new Map<string, CreatorDetail>();
  for (const d of details || []) {
    detailById.set(d.id as string, d as unknown as CreatorDetail);
  }

  // 5. For each top match, generate claim URL + draft message.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://stroby.ai";
  const matches = top.map((s) => {
    const c = s.creator;
    const detail = detailById.get(c.id) || {
      id: c.id,
      newsletter_name: c.creator_name,
      owner_name: null,
      email: null,
      url: null,
      slug: null,
      platform: null,
    };

    let claimUrl = `${appUrl}/creator/${detail.slug || c.id}`;
    let claimToken: string | undefined;
    try {
      claimToken = signClaimToken(c.id, "creator", 30);
      claimUrl = `${appUrl}/claim/${claimToken}`;
    } catch (e) {
      console.error("signClaimToken failed for", c.id, e);
    }

    const realEmail = !isShadowEmail(detail.email);
    const draft = buildDraftMessage({
      brand,
      creator: detail,
      creatorRow: c,
      reasoning: s.explanation,
      claimUrl,
    });

    return {
      creator_id: c.id,
      newsletter_name: detail.newsletter_name || c.creator_name,
      owner_name: detail.owner_name,
      niche: c.primary_niche,
      audience_reach: c.audience_reach,
      engagement_rate: c.engagement_rate,
      avg_open_rate: c.avg_open_rate,
      url: detail.url,
      slug: detail.slug,
      platform: detail.platform || c.creator_type,
      email: detail.email,
      has_real_email: realEmail,
      score: s.score,
      score_pct: Math.round(s.score * 100),
      reasoning: s.explanation,
      components: s.components,
      claim_url: claimUrl,
      claim_token: claimToken,
      draft_subject: draft.subject,
      draft_body: draft.body,
    };
  });

  return Response.json({
    brand: {
      id: brand.id,
      company_name: brand.company_name,
      niche: brand.primary_niche,
      budget_range: brand.budget_range,
      preferred_creator_type: brand.preferred_creator_type,
    },
    eligible_creator_pool: creators.length,
    matches,
  });
}
