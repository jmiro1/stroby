/**
 * POST /api/admin/embed-brands-backfill
 *
 * Backfills `profile_embedding` on EVERY business_profiles_all row that
 * has brand_intelligence but no embedding — both shadow rows AND real
 * brands (gatewayz, etc) that never had embedding generated during
 * onboarding.
 *
 * Auth: Bearer <INGEST_SECRET>.
 *
 * Query:
 *   ?limit=N        rows per call (default 200, max 500)
 *   ?include_real=1 also embed onboarding_status<>'shadow' (default: only shadow)
 *   ?force=1        re-embed rows that already have an embedding (use after
 *                   brandFingerprint changes — historical embeddings were
 *                   computed against wrong key names)
 *   ?dry_run=1      list candidates only
 *
 * Why a brand-side counterpart to embed-creators-backfill:
 *   - The /api/shadow/ingest path generates embedding inline only when
 *     content_intelligence is provided AND fingerprint comes back non-empty.
 *     Voyage rate-limit silently fails the inline call → unembedded rows
 *     pile up unnoticed (504 of 1,350 brands-with-intel were unembedded
 *     post Bet C).
 *   - Real brands (gatewayz, logika, gda cap) have NO automatic embedding
 *     hook in the customer onboarding flow → cosine_similarity always 0
 *     in their match queries → 45% of match score weight discarded.
 *   - brandFingerprint was reading wrong key names against raw Haiku
 *     output. After the normalizeBrandSynth fix in embeddings.ts, all
 *     existing brand embeddings are based on stale/empty fingerprints
 *     and benefit from re-embedding.
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createServiceClient } from "@/lib/supabase";
import { brandFingerprint } from "@/lib/intelligence/embeddings";

export const runtime = "nodejs";
export const maxDuration = 300;

const PGVECTOR_DIM = 1536;
const VOYAGE_MODEL = "voyage-3-lite";
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

async function embedBatchWithRetry(texts: string[]): Promise<number[][]> {
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
      return (data.data as Array<{ embedding: number[]; index?: number }>)
        .sort((a, b) => (a.index || 0) - (b.index || 0))
        .map(d => {
          const emb = d.embedding.slice();
          while (emb.length < PGVECTOR_DIM) emb.push(0);
          return emb;
        });
    } catch (e) {
      lastStatus = e instanceof Error ? e.message.slice(0, 100) : "unknown";
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
  const includeReal = url.searchParams.get("include_real") === "1";
  const force = url.searchParams.get("force") === "1";
  let limit = parseInt(url.searchParams.get("limit") || `${HARD_LIMIT_DEFAULT}`, 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = HARD_LIMIT_DEFAULT;
  if (limit > HARD_LIMIT_MAX) limit = HARD_LIMIT_MAX;

  const supabase = createServiceClient();

  let q = supabase
    .from("business_profiles_all")
    .select("id, company_name, brand_intelligence, onboarding_status, profile_embedding")
    .not("brand_intelligence", "is", null);
  if (!force) q = q.is("profile_embedding", null);
  if (!includeReal) q = q.eq("onboarding_status", "shadow");

  const { data: rows, error: selErr } = await q.limit(limit);
  if (selErr) {
    return NextResponse.json({ ok: false, error: `select_failed: ${selErr.message}` }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: "no rows need embedding" });
  }

  const candidates: { id: string; name: string; fp: string; status: string }[] = [];
  for (const r of rows) {
    const intel = typeof r.brand_intelligence === "string"
      ? JSON.parse(r.brand_intelligence)
      : (r.brand_intelligence as Record<string, unknown>);
    const fp = brandFingerprint(intel);
    if (fp.trim().length > 0) {
      candidates.push({
        id: r.id,
        name: (r.company_name as string) || "",
        fp,
        status: (r.onboarding_status as string) || "",
      });
    }
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      selected: rows.length,
      candidates: candidates.length,
      empty_fingerprint: rows.length - candidates.length,
      sample: candidates.slice(0, 3).map(c => ({ name: c.name, status: c.status, fp_preview: c.fp.slice(0, 140) })),
    });
  }

  let embedded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < candidates.length; i += VOYAGE_BATCH_SIZE) {
    const batch = candidates.slice(i, i + VOYAGE_BATCH_SIZE);
    let embeddings: number[][];
    try {
      embeddings = await embedBatchWithRetry(batch.map(c => c.fp));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`batch_${i}: ${msg.slice(0, 200)}`);
      failed += batch.length;
      await new Promise(r => setTimeout(r, VOYAGE_INTER_BATCH_MS));
      continue;
    }

    for (let j = 0; j < batch.length; j++) {
      // Always allow updating embedding regardless of onboarding_status
      // (real brands like gatewayz need this too — no race-safe guard
      // because re-embedding never harms a claimed row).
      const { error: updErr } = await supabase
        .from("business_profiles_all")
        .update({ profile_embedding: vecToString(embeddings[j]) })
        .eq("id", batch[j].id);
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
    empty_fingerprint: rows.length - candidates.length,
    errors: errors.slice(0, 5),
  });
}
