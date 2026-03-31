import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { fetchConvertKitMetrics } from "@/lib/newsletter-platforms";
import { sendWhatsAppMessage } from "@/lib/twilio";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { newsletterId, apiSecret } = body;

    if (!newsletterId || !apiSecret) {
      return Response.json(
        { error: "Missing newsletterId or apiSecret" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Fetch the newsletter profile
    const { data: profile, error: fetchError } = await supabase
      .from("newsletter_profiles")
      .select("*")
      .eq("id", newsletterId)
      .single();

    if (fetchError || !profile) {
      return Response.json(
        { error: "Newsletter profile not found" },
        { status: 404 }
      );
    }

    // Fetch metrics from ConvertKit API
    const metrics = await fetchConvertKitMetrics(apiSecret);

    if (!metrics) {
      return Response.json(
        {
          error:
            "Failed to fetch metrics from ConvertKit. Check your API secret.",
        },
        { status: 400 }
      );
    }

    // Compare subscriber count (10% tolerance)
    const selfSubscribers = profile.subscriber_count ?? 0;
    const subscriberDiff = selfSubscribers
      ? Math.abs(metrics.subscribers - selfSubscribers) / selfSubscribers
      : 1;

    const hasDiscrepancy = subscriberDiff > 0.1;

    const verificationData: Record<string, unknown> = {
      api_source: "convertkit",
      verified_at: new Date().toISOString(),
      api_subscribers: metrics.subscribers,
      self_reported_subscribers: selfSubscribers,
      within_tolerance: !hasDiscrepancy,
    };

    if (hasDiscrepancy) {
      verificationData.discrepancy_flagged = true;
      verificationData.subscriber_diff_pct = Math.round(subscriberDiff * 100);
    }

    // Update profile: API numbers are the truth
    const { error: updateError } = await supabase
      .from("newsletter_profiles")
      .update({
        verification_status: "api_verified",
        verification_data: verificationData,
        platform: "convertkit",
        subscriber_count: metrics.subscribers,
      })
      .eq("id", newsletterId);

    if (updateError) {
      console.error("Supabase update error:", updateError);
      return Response.json(
        { error: "Failed to update newsletter profile" },
        { status: 500 }
      );
    }

    // Send WhatsApp notification
    if (profile.phone) {
      await sendWhatsAppMessage(
        profile.phone,
        `Your subscriber count has been verified via ConvertKit! \u2713 ${metrics.subscribers.toLocaleString()} subscribers.`
      );
    }

    return Response.json({
      success: true,
      verified: true,
      metrics: {
        subscribers: metrics.subscribers,
      },
      discrepancy: hasDiscrepancy,
    });
  } catch (err) {
    console.error("ConvertKit verify API error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
