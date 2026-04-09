/**
 * POST /api/affiliates/login/verify
 *
 * Consume a magic-link token, mint a session, set the session cookie.
 * Body: { token: string }
 *
 * Called by the /affiliates/login/verify page after the user taps the
 * link from WhatsApp.
 */
import { NextRequest } from "next/server";
import { verifyMagicLink, hashIp } from "@/lib/affiliates/auth";
import { AFFILIATE_CONFIG } from "@/lib/affiliates/config";

interface VerifyBody {
  token?: string;
}

export async function POST(request: NextRequest) {
  let body: VerifyBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = (body.token ?? "").trim();
  if (!token) {
    return Response.json({ error: "Token required" }, { status: 400 });
  }

  const ipRaw =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = request.headers.get("user-agent");

  const result = await verifyMagicLink(token, hashIp(ipRaw), ua);
  if (!result.ok || !result.session_token) {
    return Response.json({ error: result.error ?? "Verification failed" }, { status: 401 });
  }

  const response = Response.json({
    success: true,
    affiliate_id: result.affiliate_id,
    expires_at: result.expires_at,
  });

  // Set the session cookie. Next 16 cookies API on Response objects:
  // we can use the response headers directly.
  const cookieValue = [
    `${AFFILIATE_CONFIG.SESSION_COOKIE_NAME}=${result.session_token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${AFFILIATE_CONFIG.SESSION_TTL_DAYS * 86400}`,
  ].join("; ");
  response.headers.append("Set-Cookie", cookieValue);

  return response;
}
