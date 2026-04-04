import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { findMatchesForBusiness } from "@/lib/matching";
import { sendWhatsAppSmart } from "@/lib/whatsapp";
import { updateUserInsights } from "@/lib/user-insights";

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

  // Fetch all active businesses that are onboarded
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
      const insertData: Record<string, unknown> = {
        business_id: business.id,
        status: "suggested",
        match_score: match.score,
        match_reasoning: match.reasoning,
        creator_id: match.creatorId,
        creator_type: match.creatorType,
      };

      // Also set newsletter_id for backwards compat when it's a newsletter
      if (match.creatorType === "newsletter") {
        insertData.newsletter_id = match.creatorId;
      }

      const { data: intro, error: introError } = await supabase
        .from("introductions")
        .insert(insertData)
        .select("id")
        .single();

      if (introError || !intro) {
        console.error("Failed to create introduction:", introError);
        continue;
      }

      matchesSuggested++;

      // Track insight: match suggested
      await updateUserInsights(business.id, "business", {
        type: "match_suggested",
        niche: match.newsletter?.primary_niche || match.otherProfile?.niche || "Unknown",
        score: match.score,
      });

      if (!business.phone) continue;

      let messageBody: string;

      if (match.creatorType === "newsletter" && match.newsletter) {
        const nl = match.newsletter;
        const priceDisplay = nl.price_per_placement
          ? `$${(nl.price_per_placement / 100).toFixed(0)}`
          : "TBD";

        messageBody = `Hi ${business.contact_name || business.company_name}! I found a newsletter that looks like a great fit for ${business.company_name}:\n\n📰 ${nl.newsletter_name}\n🎯 Niche: ${nl.primary_niche || "General"}\n👥 ${nl.subscriber_count || "N/A"} subscribers | ${nl.avg_open_rate || "N/A"}% open rate\n💰 ${priceDisplay} per placement\n\nWhy it's a match: ${match.reasoning}\n\nWant me to introduce you? Reply YES, NO, or TELL ME MORE.`;
      } else if (match.otherProfile) {
        const cr = match.otherProfile;
        messageBody = `Hi ${business.contact_name || business.company_name}! I found a creator who could be a great partner for ${business.company_name}:\n\n🎨 ${cr.name}${cr.role ? ` (${cr.role})` : ""}${cr.organization ? ` at ${cr.organization}` : ""}\n🎯 Niche: ${cr.niche || "General"}\n📝 ${cr.description || "N/A"}\n💡 What they offer: ${cr.can_offer || "N/A"}\n\nWhy it's a match: ${match.reasoning}\n\nWant me to introduce you? Reply YES, NO, or TELL ME MORE.`;
      } else {
        continue;
      }

      // Build template param {{2}} — the match description portion
      let matchDesc: string;
      if (match.creatorType === "newsletter" && match.newsletter) {
        const nl = match.newsletter;
        const priceDisplay = nl.price_per_placement
          ? `$${(nl.price_per_placement / 100).toFixed(0)}`
          : "TBD";
        matchDesc = `📰 ${nl.newsletter_name}\n🎯 Niche: ${nl.primary_niche || "General"}\n👥 ${nl.subscriber_count || "N/A"} subscribers | ${nl.avg_open_rate || "N/A"}% open rate\n💰 ${priceDisplay} per placement\n\nWhy: ${match.reasoning}`;
      } else {
        const cr = match.otherProfile!;
        matchDesc = `🎨 ${cr.name}${cr.role ? ` (${cr.role})` : ""}${cr.organization ? ` at ${cr.organization}` : ""}\n🎯 Niche: ${cr.niche || "General"}\n📝 ${cr.description || "N/A"}\n💡 Offers: ${cr.can_offer || "N/A"}\n\nWhy: ${match.reasoning}`;
      }

      const messageSid = await sendWhatsAppSmart(
        business.phone,
        messageBody,
        "match_found",
        [business.contact_name || business.company_name, matchDesc]
      );

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
