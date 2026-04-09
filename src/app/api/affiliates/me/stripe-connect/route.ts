/**
 * POST /api/affiliates/me/stripe-connect
 *
 * Generate a Stripe Connect Express onboarding link for the current
 * affiliate. Creates the connected account on first call and stores
 * the ID on the affiliate row. Subsequent calls re-issue the link.
 *
 * Phase 2 — requires Stripe Connect to be enabled at the platform
 * Stripe account level. The endpoint will return a clear error if
 * Connect isn't enabled.
 */
import { NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase";
import { getAffiliateFromSessionToken } from "@/lib/affiliates/auth";
import { AFFILIATE_CONFIG } from "@/lib/affiliates/config";

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get(AFFILIATE_CONFIG.SESSION_COOKIE_NAME)?.value;
  const affiliate = await getAffiliateFromSessionToken(sessionToken);
  if (!affiliate) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (affiliate.status !== "active") {
    return Response.json({ error: "Affiliate not active" }, { status: 403 });
  }

  const stripe = getStripe();
  const supabase = createServiceClient();

  let accountId = affiliate.stripe_account_id;

  // Create a new Express connected account if none exists
  if (!accountId) {
    try {
      const account = await stripe.accounts.create({
        type: "express",
        email: affiliate.email,
        metadata: {
          affiliate_id: affiliate.id,
          referral_code: affiliate.referral_code,
        },
      });
      accountId = account.id;

      const { error: updateError } = await supabase
        .from("affiliates")
        .update({ stripe_account_id: accountId })
        .eq("id", affiliate.id);
      if (updateError) {
        console.error("affiliate stripe_account_id update failed:", updateError);
        return Response.json(
          { error: "Failed to store account ID" },
          { status: 500 },
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("affiliate stripe accounts.create failed:", msg);
      // Surface a clear error if Connect isn't enabled
      if (msg.toLowerCase().includes("not enabled") || msg.includes("connect")) {
        return Response.json(
          {
            error:
              "Stripe Connect is not yet enabled on the Stroby platform account. " +
              "Affiliate payouts will be available once it's enabled.",
          },
          { status: 503 },
        );
      }
      return Response.json({ error: "Failed to create connected account" }, { status: 500 });
    }
  }

  // Generate the onboarding link
  try {
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${AFFILIATE_CONFIG.PUBLIC_BASE_URL}/affiliates/dashboard/payouts?refresh=true`,
      return_url: `${AFFILIATE_CONFIG.PUBLIC_BASE_URL}/affiliates/dashboard/payouts?stripe=connected`,
      type: "account_onboarding",
    });
    return Response.json({ url: accountLink.url, account_id: accountId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("affiliate accountLinks.create failed:", msg);
    return Response.json({ error: "Failed to generate onboarding link" }, { status: 500 });
  }
}
