import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { fetchBeehiivMetrics } from "@/lib/newsletter-platforms";
import { sendWhatsAppMessage } from "@/lib/twilio";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { newsletterId, apiKey } = body;

    if (!newsletterId || !apiKey) {
      return Response.json(
        { error: "Missing newsletterId or apiKey" },
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

    // Fetch metrics from Beehiiv API
    const metrics = await fetchBeehiivMetrics(apiKey);

    if (!metrics) {
      return Response.json(
        { error: "Failed to fetch metrics from Beehiiv. Check your API key." },
        { status: 400 }
      );
    }

    // Compare API metrics vs self-reported (10% tolerance)
    const selfSubscribers = profile.subscriber_count ?? 0;
    const selfOpenRate = (profile.avg_open_rate ?? 0) * 100; // stored as decimal
    const subscriberDiff = selfSubscribers
      ? Math.abs(metrics.subscribers - selfSubscribers) / selfSubscribers
      : 1;
    const openRateDiff = selfOpenRate
      ? Math.abs(metrics.openRate - selfOpenRate) / selfOpenRate
      : 1;

    const hasDiscrepancy = subscriberDiff > 0.1 || openRateDiff > 0.1;

    const verificationData: Record<string, unknown> = {
      api_source: "beehiiv",
      verified_at: new Date().toISOString(),
      api_subscribers: metrics.subscribers,
      api_open_rate: metrics.openRate,
      api_ctr: metrics.ctr,
      self_reported_subscribers: selfSubscribers,
      self_reported_open_rate: selfOpenRate,
      within_tolerance: !hasDiscrepancy,
    };

    if (hasDiscrepancy) {
      verificationData.discrepancy_flagged = true;
      verificationData.subscriber_diff_pct = Math.round(subscriberDiff * 100);
      verificationData.open_rate_diff_pct = Math.round(openRateDiff * 100);
    }

    // Update profile: API numbers are the truth
    const { error: updateError } = await supabase
      .from("newsletter_profiles")
      .update({
        verification_status: "api_verified",
        verification_data: verificationData,
        platform: "beehiiv",
        subscriber_count: metrics.subscribers,
        avg_open_rate: metrics.openRate / 100, // store as decimal
        avg_ctr: metrics.ctr / 100,
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
        `Your newsletter metrics have been verified via Beehiiv! \u2713 ${metrics.subscribers.toLocaleString()} subscribers, ${metrics.openRate.toFixed(1)}% open rate.`
      );
    }

    return Response.json({
      success: true,
      verified: true,
      metrics: {
        subscribers: metrics.subscribers,
        openRate: metrics.openRate,
        ctr: metrics.ctr,
      },
      discrepancy: hasDiscrepancy,
    });
  } catch (err) {
    console.error("Beehiiv verify API error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
