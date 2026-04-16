/**
 * POST /api/shadow/ingest
 *
 * Service-role-equivalent endpoint called by the VPS leadgen sidecar to
 * write enriched brand / creator rows into the product DB as shadows.
 *
 * Auth: Bearer <INGEST_SECRET>, compared with timingSafeEqual.
 *
 * Body:
 *   { type: "brand" | "creator",
 *     source: "yc-w25" | "meta-adlib" | ... ,
 *     data: { company_name | newsletter_name, website_url | url, ... } }
 *
 * Response:
 *   { ok: true, id: "<uuid>", status: "created"|"updated"|"skipped_real" }
 *   { ok: false, error: "..." }
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { upsertShadowBrand, upsertShadowCreator } from "@/lib/shadow/ingest";

export const runtime = "nodejs";

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

// Defensive: cap body to 200kb so a malformed client can't blow up the runtime
const MAX_BODY_BYTES = 200_000;

export async function POST(req: NextRequest) {
  if (!authOk(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const contentLengthHdr = req.headers.get("content-length");
  if (contentLengthHdr && parseInt(contentLengthHdr, 10) > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "body_too_large" }, { status: 413 });
  }

  let body: { type?: string; source?: string; data?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  if (body.type !== "brand" && body.type !== "creator") {
    return NextResponse.json({ ok: false, error: "invalid_type" }, { status: 400 });
  }
  if (!body.source || typeof body.source !== "string" || body.source.length > 64) {
    return NextResponse.json({ ok: false, error: "invalid_source" }, { status: 400 });
  }
  if (!body.data || typeof body.data !== "object") {
    return NextResponse.json({ ok: false, error: "invalid_data" }, { status: 400 });
  }

  try {
    if (body.type === "brand") {
      const result = await upsertShadowBrand({
        ...(body.data as Record<string, unknown>),
        source: body.source,
      } as Parameters<typeof upsertShadowBrand>[0]);
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    } else {
      const result = await upsertShadowCreator({
        ...(body.data as Record<string, unknown>),
        source: body.source,
      } as Parameters<typeof upsertShadowCreator>[0]);
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }
  } catch (err) {
    console.error("shadow/ingest error:", err);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
