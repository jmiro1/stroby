/**
 * /r/[code] — affiliate referral link.
 *
 * Looks up the affiliate by code, sets a 30-day cookie with the
 * affiliate ID, and redirects to the homepage. Cookies are HttpOnly,
 * Secure, SameSite=Lax to survive normal cross-origin click flows.
 */
import { NextRequest, NextResponse } from "next/server";
import { AFFILIATE_CONFIG } from "@/lib/affiliates/config";
import { isValidCodeShape, normalizeCode } from "@/lib/affiliates/codes";
import { getAffiliateByCode } from "@/lib/affiliates/queries";

interface RouteContext {
  params: Promise<{ code: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { code } = await context.params;
  const normalized = normalizeCode(code || "");

  // Always redirect to home, even if the code is invalid — don't leak whether
  // a code exists. Only set the cookie if the code is real and active.
  const redirectTo = new URL("/", AFFILIATE_CONFIG.PUBLIC_BASE_URL);
  const response = NextResponse.redirect(redirectTo);

  if (!isValidCodeShape(normalized)) {
    return response;
  }

  const affiliate = await getAffiliateByCode(normalized);
  if (!affiliate || affiliate.status !== "active") {
    return response;
  }

  response.cookies.set({
    name: AFFILIATE_CONFIG.REFERRAL_COOKIE_NAME,
    value: affiliate.id,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: AFFILIATE_CONFIG.COOKIE_DAYS * 86400,
    path: "/",
  });
  return response;
}
