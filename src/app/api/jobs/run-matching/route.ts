import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { findMatchesForBusiness } from "@/lib/matching";
import { sendWhatsAppMessage } from "@/lib/twilio";

export async function POST(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Fetch all active businesses that are onboarded (full profiles for messaging)
  const { data: businesses, error } = await supabase
    .from("business_profiles")
    .select("*")
    .in("onboarding_status", [
      "fully_onboarded",
      "whatsapp_active",
      "widget_complete",
    ]);

  if (error || !businesses) {
    console.error("Failed to fetch businesses:", error);
    return Response.json(
      { error: "Failed to fetch businesses" },
      { status: 500 }
    );
  }

  let businessesProcessed = 0;
  let matchesSuggested = 0;

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  for (const business of businesses) {
    // Rate limit: max 3 suggestions per business per week
    const { count } = await supabase
      .from("introductions")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("status", "suggested")
      .gte("created_at", oneWeekAgo.toISOString());

    if ((count ?? 0) >= 3) {
      continue;
    }

    const matches = await findMatchesForBusiness(business.id);
    businessesProcessed++;

    for (const match of matches) {
      // Insert the introduction record
      const { data: intro, error: introError } = await supabase
        .from("introductions")
        .insert({
          business_id: business.id,
          newsletter_id: match.newsletter.id,
          status: "suggested",
          match_score: match.score,
          match_reasoning: match.reasoning,
        })
        .select("id")
        .single();

      if (introError || !intro) {
        console.error("Failed to create introduction:", introError);
        continue;
      }

      matchesSuggested++;

      // Fetch the full newsletter profile for the message
      const { data: newsletter } = await supabase
        .from("newsletter_profiles")
        .select("*")
        .eq("id", match.newsletter.id)
        .single();

      if (!newsletter || !business.phone) continue;

      // Format price from cents to dollars
      const priceDisplay = newsletter.price_per_placement
        ? `$${(newsletter.price_per_placement / 100).toFixed(0)}`
        : "TBD";

      const messageBody = `Hi ${business.contact_name || business.company_name}! I found a newsletter that looks like a great fit for ${business.company_name}:\n\n📰 ${newsletter.newsletter_name}\n🎯 Niche: ${newsletter.primary_niche || "General"}\n👥 ${newsletter.subscriber_count || "N/A"} subscribers | ${newsletter.avg_open_rate || "N/A"}% open rate\n💰 ${priceDisplay} per placement\n\nWhy it's a match: ${match.reasoning}\n\nWant me to introduce you? Reply YES, NO, or TELL ME MORE.`;

      // Send WhatsApp message to the business
      const messageSid = await sendWhatsAppMessage(
        business.phone,
        messageBody
      );

      // Log the outbound message
      await supabase.from("agent_messages").insert({
        direction: "outbound",
        user_type: "business",
        user_id: business.id,
        phone: business.phone,
        content: messageBody,
        message_type: "match_suggestion",
        related_introduction_id: intro.id,
        external_id: messageSid,
      });
    }
  }

  return Response.json({ businessesProcessed, matchesSuggested });
}
