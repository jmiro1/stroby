/**
 * POST /api/admin/embed-creators-backfill
 *
 * One-shot admin endpoint that backfills `profile_embedding` on every
 * newsletter_profiles_all row currently NULL. Includes shadow rows
 * (which the regular /api/admin embed-all path skips because it queries
 * the client-facing `newsletter_profiles` view).
 *
 * Auth: Bearer <INGEST_SECRET> (same secret as /api/shadow/ingest).
 *
 * Query:
 *   ?limit=N      cap rows processed this call (default 200, max 1000)
 *   ?dry_run=1    don't write embeddings, just report what would happen
 *
 * Why a separate endpoint:
 *   - existing embedAllProfiles in lib/intelligence/embeddings.ts targets
 *     the filtered `newsletter_profiles` view → shadow rows excluded
 *   - the inline embed call in /api/shadow/ingest fails silently on Voyage
 *     rate-limits or transient errors, leaving rows unembedded (we saw
 *     20/23 unembedded after the Bet A backfill)
 *   - this endpoint batches (Voyage allows up to 128 per call), retries,
 *     and exposes counts so we can re-run safely until clean
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createServiceClient } from "@/lib/supabase";
import { creatorFingerprint } from "@/lib/intelligence/embeddings";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — Voyage batches of 128 take 5-15s each

const PGVECTOR_DIM = 1536;
const VOYAGE_MODEL = "voyage-3-lite";
// Smaller batches + inter-batch sleep — Voyage rate-limits aggressively
// on burst calls. 32 inputs ≈ 5K tokens; spaced 800ms apart we stay well
// under 300 RPM and 1M TPM tiered limits.
const VOYAGE_BATCH_SIZE = 32;
const VOYAGE_INTER_BATCH_MS = 800;
const VOYAGE_MAX_RETRIES = 5;
const HARD_LIMIT_DEFAULT = 200;
const HARD_LIMIT_MAX = 500;

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

function fallbackFingerprint(row: {
  newsletter_name?: string | null;
  primary_niche?: string | null;
  description?: string | null;
  url?: string | null;
}): string {
  // Used when content_intelligence is missing — produces a usable but
  // less informative embedding fingerprint from raw row fields.
  const parts: string[] = [];
  if (row.newsletter_name) parts.push(row.newsletter_name);
  if (row.primary_niche) parts.push(`Niche: ${row.primary_niche}`);
  if (row.description) parts.push(row.description.slice(0, 800));
  return parts.join(". ");
}

async function embedBatchWithRetry(texts: string[]): Promise<{ embeddings: number[][]; status: string }> {
  const apiKey = process.env.VOYAGEAI_API_KEY;
  if (!apiKey) throw new Error("VOYAGEAI_API_KEY not set");

  let lastStatus = "no_attempt";
  for (let attempt = 0; attempt < VOYAGE_MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ input: texts, model: VOYAGE_MODEL, input_type: "document" }),
        signal: AbortSignal.timeout(60_000),
      });
      if (resp.status === 429 || resp.status >= 500) {
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s
        const wait = 1000 * Math.pow(2, attempt);
        lastStatus = `${resp.status}_retry${attempt}`;
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!resp.ok) {
        const detail = await resp.text();
        throw new Error(`voyage_${resp.status}: ${detail.slice(0, 200)}`);
      }
      const data = await resp.json();
      const embeddings = (data.data as Array<{ embedding: number[]; index?: number }>)
        .sort((a, b) => (a.index || 0) - (b.index || 0))
        .map(d => {
          const emb = d.embedding.slice();
          while (emb.length < PGVECTOR_DIM) emb.push(0);
          return emb;
        });
      return { embeddings, status: "ok" };
    } catch (e) {
      lastStatus = e instanceof Error ? e.message.slice(0, 100) : "unknown_error";
      const wait = 1000 * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw new Error(`voyage_exhausted: ${lastStatus}`);
}

export async function POST(req: NextRequest) {
  if (!authOk(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "1";
  let limit = parseInt(url.searchParams.get("limit") || `${HARD_LIMIT_DEFAULT}`, 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = HARD_LIMIT_DEFAULT;
  if (limit > HARD_LIMIT_MAX) limit = HARD_LIMIT_MAX;

  const supabase = createServiceClient();

  // Pull rows that need embeddings. Prefer rows that already have
  // content_intelligence (better fingerprint) — they're the ones the
  // matching engine cares about most.
  const { data: rows, error: selErr } = await supabase
    .from("newsletter_profiles_all")
    .select("id, newsletter_name, primary_niche, description, url, content_intelligence")
    .is("profile_embedding", null)
    .order("content_intelligence", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (selErr) {
    return NextResponse.json({ ok: false, error: `select_failed: ${selErr.message}` }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: "no rows need embedding" });
  }

  // Build fingerprint per row
  const candidates: { id: string; fp: string; via: "content_intel" | "fallback" }[] = [];
  for (const r of rows) {
    let fp = "";
    let via: "content_intel" | "fallback" = "fallback";
    if (r.content_intelligence) {
      const intel = typeof r.content_intelligence === "string"
        ? JSON.parse(r.content_intelligence)
        : (r.content_intelligence as Record<string, unknown>);
      // creatorFingerprint expects { synthesized: {...} } shape
      fp = creatorFingerprint(intel);
      if (fp) via = "content_intel";
    }
    if (!fp) {
      fp = fallbackFingerprint(r);
      via = "fallback";
    }
    if (fp.trim()) candidates.push({ id: r.id, fp, via });
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      candidates: candidates.length,
      via_content_intel: candidates.filter(c => c.via === "content_intel").length,
      via_fallback: candidates.filter(c => c.via === "fallback").length,
      sample: candidates.slice(0, 3).map(c => ({ id: c.id, via: c.via, fp_preview: c.fp.slice(0, 120) })),
    });
  }

  // Embed in small batches with inter-batch sleep so we stay under
  // Voyage rate limits. The previous attempt hammered the API with
  // 128-input batches and got rate-limited starting on iter 2.
  let embedded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < candidates.length; i += VOYAGE_BATCH_SIZE) {
    const batch = candidates.slice(i, i + VOYAGE_BATCH_SIZE);
    let result: { embeddings: number[][]; status: string };
    try {
      result = await embedBatchWithRetry(batch.map(c => c.fp));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`batch_${i}: ${msg.slice(0, 200)}`);
      failed += batch.length;
      // Inter-batch sleep applies even on failure — gives the rate
      // limiter time to recover before the next attempt.
      await new Promise(r => setTimeout(r, VOYAGE_INTER_BATCH_MS));
      continue;
    }

    // Update each row sequentially (heterogeneous values per row).
    for (let j = 0; j < batch.length; j++) {
      const { error: updErr } = await supabase
        .from("newsletter_profiles_all")
        .update({ profile_embedding: vecToString(result.embeddings[j]) })
        .eq("id", batch[j].id)
        .eq("onboarding_status", "shadow");
      if (updErr) {
        errors.push(`update_${batch[j].id}: ${updErr.message.slice(0, 120)}`);
        failed++;
      } else {
        embedded++;
      }
    }
    await new Promise(r => setTimeout(r, VOYAGE_INTER_BATCH_MS));
  }

  return NextResponse.json({
    ok: true,
    selected: rows.length,
    processed: candidates.length,
    embedded,
    failed,
    via_content_intel: candidates.filter(c => c.via === "content_intel").length,
    via_fallback: candidates.filter(c => c.via === "fallback").length,
    errors: errors.slice(0, 10),
  });
}
