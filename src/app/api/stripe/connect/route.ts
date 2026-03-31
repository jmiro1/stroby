import { NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://stroby.ai";

export async function POST(request: NextRequest) {
  try {
    const { newsletterId } = await request.json();

    if (!newsletterId) {
      return Response.json(
        { error: "newsletterId is required" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const stripe = getStripe();

    // Look up newsletter profile
    const { data: profile, error: profileError } = await supabase
      .from("newsletter_profiles")
      .select("*")
      .eq("id", newsletterId)
      .single();

    if (profileError || !profile) {
      return Response.json(
        { error: "Newsletter profile not found" },
        { status: 404 }
      );
    }

    let accountId = profile.stripe_account_id;

    // Create a new Express connected account if none exists
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: profile.email,
        metadata: { profile_id: newsletterId },
      });

      accountId = account.id;

      // Store the account ID in newsletter_profiles
      const { error: updateError } = await supabase
        .from("newsletter_profiles")
        .update({ stripe_account_id: accountId })
        .eq("id", newsletterId);

      if (updateError) {
        console.error("Failed to store stripe_account_id:", updateError);
        return Response.json(
          { error: "Failed to update profile" },
          { status: 500 }
        );
      }
    }

    // Generate an account link for onboarding (or re-onboarding)
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url:
        APP_URL + "/stripe/connect?refresh=true&id=" + newsletterId,
      return_url:
        APP_URL + "/stripe/connect/complete?id=" + newsletterId,
      type: "account_onboarding",
    });

    return Response.json({ url: accountLink.url });
  } catch (err) {
    console.error("Stripe Connect onboarding error:", err);
    return Response.json(
      { error: "Failed to create onboarding link" },
      { status: 500 }
    );
  }
}
