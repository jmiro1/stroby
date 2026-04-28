/**
 * POST /api/admin/brand-intel-backfill
 *
 * Backfills `brand_intelligence` on shadow brand rows that have a
 * scrapeable website but no intel yet. Reuses the existing
 * `analyzeBrandWebsite` Haiku pipeline.
 *
 * Auth: Bearer <INGEST_SECRET>.
 *
 * Query:
 *   ?limit=N          rows per call (default 25, max 100 — Haiku scrapes
 *                     are slow, keep batches small)
 *   ?source=<src>     filter shadow_source (default: any source)
 *   ?dry_run=1        list candidates only
 *
 * Why:
 *   842 of 14,895 brand shadows have intelligence (~6%). The 502
 *   meta-adlib + 33 kickstarter rows have the strongest budget signal
 *   but zero intel. YC batches W18-S26 have ~500 rows missing intel.
 *   This endpoint backfills based on description (which contains
 *   `Website: <url>` for YC + Kickstarter rows).
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createServiceClient } from "@/lib/supabase";
import { analyzeBrandWebsite } from "@/lib/intelligence/brand";
import { brandFingerprint } from "@/lib/intelligence/embeddings";

export const runtime = "nodejs";
export const maxDuration = 300;

const PGVECTOR_DIM = 1536;
const VOYAGE_MODEL = "voyage-3-lite";
const HARD_LIMIT_DEFAULT = 25;
const HARD_LIMIT_MAX = 100;

function authOk(req: NextRequest): boolean {
  const header = req.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  const expected = process.env.INGEST_SECRET || "";
  if (!token || !expected) return false;
  if (token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

function vecToString(vec: number[]): string {
  return "[" + vec.join(",") + "]";
}

// Extract a URL from a row's description. YC/Kickstarter rows are
// formatted as "Website: https://example.com | <description>"
function urlFromDescription(desc: string | null): string | null {
  if (!desc) return null;
  const m = desc.match(/https?:\/\/[^\s|>]+/);
  return m ? m[0] : null;
}

async function embedFingerprint(fp: string): Promise<number[] | null> {
  const apiKey = process.env.VOYAGEAI_API_KEY;
  if (!apiKey || !fp.trim()) return null;
  try {
    const resp = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input: [fp], model: VOYAGE_MODEL, input_type: "document" }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const emb = (data.data as Array<{ embedding: number[] }>)[0]?.embedding;
    if (!emb) return null;
    while (emb.length < PGVECTOR_DIM) emb.push(0);
    return emb;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  if (!authOk(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "1";
  const sourceFilter = url.searchParams.get("source") || null;
  let limit = parseInt(url.searchParams.get("limit") || `${HARD_LIMIT_DEFAULT}`, 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = HARD_LIMIT_DEFAULT;
  if (limit > HARD_LIMIT_MAX) limit = HARD_LIMIT_MAX;

  const supabase = createServiceClient();

  const includeReal = url.searchParams.get("include_real") === "1";
  const brandIdFilter = url.searchParams.get("brand_id");

  let q = supabase
    .from("business_profiles_all")
    .select("id, company_name, primary_niche, description, shadow_source, onboarding_status, email")
    .is("brand_intelligence", null);
  if (!includeReal) q = q.eq("onboarding_status", "shadow");
  if (sourceFilter) q = q.eq("shadow_source", sourceFilter);
  if (brandIdFilter) q = q.eq("id", brandIdFilter);
  // Description filter is too strict for real brands — relax when including real
  if (!includeReal) q = q.not("description", "is", null);

  const { data: rows, error: selErr } = await q.limit(limit);

  if (selErr) {
    return NextResponse.json({ ok: false, error: `select_failed: ${selErr.message}` }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: "no rows need brand intel" });
  }

  // Filter to rows where we can extract a usable URL.
  // For real brands the URL might come from email domain or company_name.
  const candidates: { id: string; name: string; website: string; source: string | null }[] = [];
  for (const r of rows) {
    let website = urlFromDescription(r.description as string | null);
    if (!website && r.email && typeof r.email === "string") {
      // Real brands: derive from email domain (e.g. founder@gatewayz.ai → gatewayz.ai)
      const m = (r.email as string).match(/@([^@\s]+\.[a-z]{2,})$/i);
      if (m && !m[1].endsWith("@shadow.stroby.ai") && !m[1].includes("gmail") && !m[1].includes("yahoo") && !m[1].includes("outlook")) {
        website = `https://${m[1].toLowerCase()}`;
      }
    }
    if (!website && r.company_name && typeof r.company_name === "string") {
      // Last resort: try company_name as domain (gatewayz → gatewayz.ai/.com)
      const slug = (r.company_name as string).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
      if (slug.length >= 3 && slug.length <= 30) {
        website = `https://${slug}.com`;
      }
    }
    if (website) {
      candidates.push({
        id: r.id,
        name: (r.company_name as string) || "",
        website,
        source: (r.shadow_source as string) || (r.onboarding_status as string) || null,
      });
    }
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      selected: rows.length,
      candidates: candidates.length,
      no_url_skipped: rows.length - candidates.length,
      sample: candidates.slice(0, 5).map(c => ({ name: c.name, website: c.website, source: c.source })),
    });
  }

  let analyzed = 0;
  let embedded = 0;
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const c of candidates) {
    let intel: Record<string, unknown> | null = null;
    try {
      intel = await analyzeBrandWebsite(c.website, c.name);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`analyze_${c.id}: ${msg.slice(0, 120)}`);
      failed++;
      continue;
    }
    if (!intel) {
      // Skip silently — analyzeBrandWebsite returns null on thin pages.
      // Don't count as a hard failure; just count as analyzed-but-empty.
      analyzed++;
      continue;
    }
    analyzed++;

    // Build embedding from the new intel
    const synth = (intel.synthesized as Record<string, unknown>) ? intel : { synthesized: intel };
    const fp = brandFingerprint(synth);
    let embedding: number[] | null = null;
    if (fp) embedding = await embedFingerprint(fp);
    if (embedding) embedded++;

    const updates: Record<string, unknown> = { brand_intelligence: intel };
    if (embedding) updates.profile_embedding = vecToString(embedding);

    // Race-safe filter: only on shadow rows when we're not explicitly
    // operating on real brands. With include_real=1, drop the guard so
    // gatewayz/gda cap/etc actually get their intel persisted.
    // (Earlier attempt used head:true count mode which Supabase appears
    // to short-circuit before commit — switched to .select() returning
    // data so we can verify the row was actually written.)
    let upd = supabase
      .from("business_profiles_all")
      .update(updates)
      .eq("id", c.id);
    if (!includeReal) upd = upd.eq("onboarding_status", "shadow");

    const { data: updRows, error: updErr } = await upd.select("id");
    if (updErr) {
      errors.push(`update_${c.id}: ${updErr.message.slice(0, 120)}`);
      failed++;
    } else if (!updRows || updRows.length === 0) {
      errors.push(`update_${c.id}: no rows matched (onboarding_status filter?)`);
      failed++;
    } else {
      updated++;
    }
  }

  return NextResponse.json({
    ok: true,
    selected: rows.length,
    candidates: candidates.length,
    analyzed,
    embedded,
    updated,
    failed,
    no_url_skipped: rows.length - candidates.length,
    errors: errors.slice(0, 5),
  });
}
