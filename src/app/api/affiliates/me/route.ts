/**
 * GET /api/affiliates/me
 *
 * Returns the current affiliate's profile + dashboard summary.
 * Auth via the stroby_aff_session cookie set during login verification.
 */
import { NextRequest } from "next/server";
import { getAffiliateFromSessionToken } from "@/lib/affiliates/auth";
import { getCommissionTotals, listReferralsByAffiliate } from "@/lib/affiliates/queries";
import { AFFILIATE_CONFIG } from "@/lib/affiliates/config";

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get(AFFILIATE_CONFIG.SESSION_COOKIE_NAME)?.value;
  const affiliate = await getAffiliateFromSessionToken(sessionToken);
  if (!affiliate) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [totals, recentReferrals] = await Promise.all([
    getCommissionTotals(affiliate.id),
    listReferralsByAffiliate(affiliate.id, { limit: 20 }),
  ]);

  const referralLink = `${AFFILIATE_CONFIG.PUBLIC_BASE_URL}/r/${affiliate.referral_code}`;

  return Response.json({
    affiliate: {
      id: affiliate.id,
      full_name: affiliate.full_name,
      display_name: affiliate.display_name,
      email: affiliate.email,
      phone: affiliate.phone,
      bio: affiliate.bio,
      referral_code: affiliate.referral_code,
      referral_link: referralLink,
      status: affiliate.status,
      tier: affiliate.tier,
      stripe_payouts_enabled: affiliate.stripe_payouts_enabled,
      lifetime_referrals: affiliate.lifetime_referrals,
      lifetime_deals: affiliate.lifetime_deals,
      lifetime_earned_cents: affiliate.lifetime_earned_cents,
      lifetime_paid_cents: affiliate.lifetime_paid_cents,
    },
    totals,
    recent_referrals: recentReferrals.map((r) => ({
      id: r.id,
      status: r.status,
      attribution_method: r.attribution_method,
      pending_email: r.pending_email,
      pending_name: r.pending_name,
      pending_role: r.pending_role,
      newsletter_profile_id: r.newsletter_profile_id,
      business_profile_id: r.business_profile_id,
      other_profile_id: r.other_profile_id,
      created_at: r.created_at,
      signed_up_at: r.signed_up_at,
      expires_at: r.expires_at,
    })),
  });
}
