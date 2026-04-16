/**
 * POST /api/shadow/claim
 *
 * Promotes a shadow profile → real user, atomically. Called by the
 * /claim/[token] page after the user fills the abbreviated onboarding form.
 *
 * Auth: HMAC-signed claim token (not the service-role INGEST_SECRET).
 *       Token carries { profile_id, profile_type, expires_at }.
 *
 * Body: the form data (phone, email, optional field edits).
 *
 * Race-safe: UPDATE ... WHERE id = $1 AND onboarding_status = 'shadow'.
 * If row already claimed, returns 409. If token invalid, returns 401.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyClaimToken } from "@/lib/shadow/tokens";
import { claimShadowBrand, claimShadowCreator } from "@/lib/shadow/claim";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 20_000;

function validPhone(p: unknown): p is string {
  if (typeof p !== "string") return false;
  const cleaned = p.replace(/\D/g, "");
  return cleaned.length >= 7 && cleaned.length <= 15;
}

function validEmail(e: unknown): e is string {
  if (typeof e !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 320;
}

export async function POST(req: NextRequest) {
  const contentLengthHdr = req.headers.get("content-length");
  if (contentLengthHdr && parseInt(contentLengthHdr, 10) > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "body_too_large" }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : null;
  if (!token) return NextResponse.json({ ok: false, error: "missing_token" }, { status: 400 });

  const verified = verifyClaimToken(token);
  if (!verified.ok || !verified.payload) {
    return NextResponse.json({ ok: false, error: verified.error || "bad_token" }, { status: 401 });
  }

  // Validate form fields
  if (!validPhone(body.phone)) {
    return NextResponse.json({ ok: false, error: "invalid_phone" }, { status: 400 });
  }
  if (body.email && !validEmail(body.email)) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  // Cap all string field lengths to avoid DB bloat
  const capped: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === "string") capped[k] = v.slice(0, 500);
    else if (typeof v === "number" && Number.isFinite(v)) capped[k] = v;
  }

  const { profile_id, profile_type } = verified.payload;

  let result;
  if (profile_type === "brand") {
    result = await claimShadowBrand(profile_id, {
      phone: capped.phone as string,
      email: (capped.email as string) || undefined,
      company_name: (capped.company_name as string) || undefined,
      contact_name: (capped.contact_name as string) || undefined,
      contact_role: (capped.contact_role as string) || undefined,
      budget_range: (capped.budget_range as string) || undefined,
      primary_niche: (capped.primary_niche as string) || undefined,
    });
  } else {
    result = await claimShadowCreator(profile_id, {
      phone: capped.phone as string,
      email: (capped.email as string) || undefined,
      newsletter_name: (capped.newsletter_name as string) || undefined,
      owner_name: (capped.owner_name as string) || undefined,
      primary_niche: (capped.primary_niche as string) || undefined,
      subscriber_count: typeof capped.subscriber_count === "number" ? (capped.subscriber_count as number) : undefined,
    });
  }

  if (!result.ok) {
    const status = result.error === "not_found" ? 404
      : result.error === "already_claimed" ? 409
      : 500;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json({ ok: true, id: result.id, profile_type });
}
