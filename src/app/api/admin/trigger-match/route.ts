import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { findMatchesForBusiness } from "@/lib/matching";
import { sendWhatsAppSmart } from "@/lib/whatsapp";
import { updateUserInsights } from "@/lib/user-insights";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { key, userId, userType } = body as {
    key?: string;
    userId?: string;
    userType?: string;
  };

  const adminPassword = process.env.ADMIN_PASSWORD || "Stroby12!";
  if (key !== adminPassword) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!userId) {
    return Response.json({ error: "userId is required" }, { status: 400 });
  }

  if (userType !== "business") {
    return Response.json(
      { error: "Only userType 'business' is supported" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  // Fetch the business profile
  const { data: business, error: bizError } = await supabase
    .from("business_profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (bizError || !business) {
    return Response.json(
      { error: "Business not found", details: bizError?.message },
      { status: 404 }
    );
  }

  const matches = await findMatchesForBusiness(userId);

  const details: {
    creatorName: string;
    creatorType: string;
    score: number;
    introductionId: string | null;
    messageSent: boolean;
  }[] = [];

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
      details.push({
        creatorName: match.creatorName,
        creatorType: match.creatorType,
        score: match.score,
        introductionId: null,
        messageSent: false,
      });
      continue;
    }

    // Track insight
    await updateUserInsights(business.id, "business", {
      type: "match_suggested",
      niche:
        match.newsletter?.primary_niche ||
        match.otherProfile?.niche ||
        "Unknown",
      score: match.score,
    });

    let messageSent = false;

    if (business.phone) {
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
        details.push({
          creatorName: match.creatorName,
          creatorType: match.creatorType,
          score: match.score,
          introductionId: intro.id,
          messageSent: false,
        });
        continue;
      }

      // Build template param for match description
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

      messageSent = true;
    }

    details.push({
      creatorName: match.creatorName,
      creatorType: match.creatorType,
      score: match.score,
      introductionId: intro.id,
      messageSent,
    });
  }

  return Response.json({ matchesFound: matches.length, details });
}
