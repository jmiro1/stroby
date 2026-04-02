import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { sendWhatsAppMessage, sendWhatsAppSmart } from "@/lib/whatsapp";

// Helper to get creator profile from either table
async function getCreatorProfile(
  supabase: ReturnType<typeof createServiceClient>,
  intro: Record<string, unknown>
): Promise<{ profile: Record<string, unknown>; type: "newsletter" | "other"; name: string; phone: string | null } | null> {
  const creatorType = intro.creator_type as string | null;
  const creatorId = intro.creator_id as string | null;

  // Try new creator_id/creator_type first, fall back to newsletter_id
  if (creatorType === "other" && creatorId) {
    const { data } = await supabase
      .from("other_profiles")
      .select("*")
      .eq("id", creatorId)
      .single();
    if (data) {
      return { profile: data, type: "other", name: data.name, phone: data.phone };
    }
  }

  // Newsletter — use newsletter_id (or creator_id if type is newsletter)
  const nlId = (intro.newsletter_id || creatorId) as string | null;
  if (nlId) {
    const { data } = await supabase
      .from("newsletter_profiles")
      .select("*")
      .eq("id", nlId)
      .single();
    if (data) {
      return { profile: data, type: "newsletter", name: data.newsletter_name || data.owner_name, phone: data.phone };
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    introductionId,
    responderId,
    responderType,
    response,
  }: {
    introductionId: string;
    responderId: string;
    responderType: "business" | "newsletter" | "other";
    response: "accept" | "decline" | "tell_me_more";
  } = body;

  if (!introductionId || !responderId || !responderType || !response) {
    return Response.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  // Fetch the introduction
  const { data: intro, error: introError } = await supabase
    .from("introductions")
    .select("*, business_profiles(*)")
    .eq("id", introductionId)
    .single();

  if (introError || !intro) {
    return Response.json(
      { error: "Introduction not found" },
      { status: 404 }
    );
  }

  const business = intro.business_profiles as Record<string, unknown>;

  // Get the creator profile (newsletter or other)
  const creator = await getCreatorProfile(supabase, intro);
  if (!creator) {
    return Response.json({ error: "Creator profile not found" }, { status: 404 });
  }

  let newStatus = intro.status as string;
  const creatorLabel = creator.type === "newsletter" ? "newsletter owner" : "creator";

  // --- BUSINESS RESPONDS ---
  if (responderType === "business") {
    if (response === "accept") {
      newStatus = "business_accepted";
      await supabase
        .from("introductions")
        .update({
          status: "business_accepted",
          business_response_at: new Date().toISOString(),
        })
        .eq("id", introductionId);

      // Send WhatsApp to creator asking if they want the intro
      if (creator.phone) {
        let creatorMessage: string;

        if (creator.type === "newsletter") {
          const nl = creator.profile;
          const priceDisplay = nl.price_per_placement
            ? `$${((nl.price_per_placement as number) / 100).toFixed(0)}`
            : "TBD";

          creatorMessage = `Hi ${nl.owner_name || creator.name}! A business wants to sponsor your newsletter:\n\n🏢 ${business.company_name}\n🎯 Niche: ${business.primary_niche || "General"}\n📝 ${business.product_description || "N/A"}\n👤 Target: ${business.target_customer || "N/A"}\n💰 Your rate: ${priceDisplay} per placement\n\nMatch score: ${((intro.match_score as number) * 100).toFixed(0)}%\nWhy: ${intro.match_reasoning}\n\nWant me to connect you? Reply YES, NO, or TELL ME MORE.`;
        } else {
          creatorMessage = `Hi ${creator.name}! A business wants to partner with you:\n\n🏢 ${business.company_name}\n🎯 Niche: ${business.primary_niche || "General"}\n📝 ${business.product_description || "N/A"}\n👤 Target: ${business.target_customer || "N/A"}\n\nMatch score: ${((intro.match_score as number) * 100).toFixed(0)}%\nWhy: ${intro.match_reasoning}\n\nWant me to connect you? Reply YES, NO, or TELL ME MORE.`;
        }

        const matchContext = `🏢 ${business.company_name}\n🎯 ${business.primary_niche || "General"}\n📝 ${business.product_description || "N/A"}\nMatch score: ${((intro.match_score as number) * 100).toFixed(0)}%\nWhy: ${intro.match_reasoning}`;
        const messageSid = await sendWhatsAppSmart(creator.phone, creatorMessage, "match_confirmation", [creator.name, matchContext]);

        await supabase.from("agent_messages").insert({
          direction: "outbound",
          user_type: creator.type,
          user_id: creator.profile.id,
          phone: creator.phone,
          content: creatorMessage,
          message_type: "intro_request",
          related_introduction_id: introductionId,
          external_id: messageSid,
        });
      }
    } else if (response === "decline") {
      newStatus = "business_declined";
      await supabase
        .from("introductions")
        .update({
          status: "business_declined",
          business_response_at: new Date().toISOString(),
        })
        .eq("id", introductionId);

      if (business.phone) {
        const declineMsg =
          "No worries! I'll keep looking for better matches for you. 🔍";
        const messageSid = await sendWhatsAppMessage(
          business.phone as string,
          declineMsg
        );

        await supabase.from("agent_messages").insert({
          direction: "outbound",
          user_type: "business",
          user_id: business.id,
          phone: business.phone,
          content: declineMsg,
          message_type: "decline_ack",
          related_introduction_id: introductionId,
          external_id: messageSid,
        });
      }
    } else if (response === "tell_me_more") {
      if (business.phone) {
        let detailMsg: string;

        if (creator.type === "newsletter") {
          const nl = creator.profile;
          detailMsg = `Here's more about ${nl.newsletter_name}:\n\n📰 Niche: ${nl.primary_niche || "General"}\n📝 ${nl.description || "No description available"}\n👥 ${nl.subscriber_count || "N/A"} subscribers\n📊 ${nl.avg_open_rate || "N/A"}% open rate | ${nl.avg_ctr || "N/A"}% CTR\n✅ API verified: ${nl.api_verified ? "Yes" : "No"}\n⭐ Avg rating: ${nl.avg_match_rating || "New"}\n\nWould you like me to introduce you? Reply YES or NO.`;
        } else {
          const cr = creator.profile;
          detailMsg = `Here's more about ${cr.name}:\n\n🎨 Role: ${cr.role || "N/A"}\n🏢 Organization: ${cr.organization || "N/A"}\n📝 ${cr.description || "No description available"}\n💡 What they offer: ${cr.can_offer || "N/A"}\n🎯 Looking for: ${cr.looking_for || "N/A"}\n🌐 Website: ${cr.website || "N/A"}\n⭐ Avg rating: ${cr.avg_match_rating || "New"}\n\nWould you like me to introduce you? Reply YES or NO.`;
        }

        const messageSid = await sendWhatsAppMessage(
          business.phone as string,
          detailMsg
        );

        await supabase.from("agent_messages").insert({
          direction: "outbound",
          user_type: "business",
          user_id: business.id,
          phone: business.phone,
          content: detailMsg,
          message_type: "match_details",
          related_introduction_id: introductionId,
          external_id: messageSid,
        });
      }
    }
  }

  // --- CREATOR RESPONDS (newsletter or other) ---
  if (responderType === "newsletter" || responderType === "other") {
    if (response === "accept") {
      newStatus = "newsletter_accepted";
      await supabase
        .from("introductions")
        .update({
          status: "newsletter_accepted",
          newsletter_response_at: new Date().toISOString(),
        })
        .eq("id", introductionId);

      // Check if double opt-in is complete
      if (intro.status === "business_accepted") {
        newStatus = "introduced";
        await supabase
          .from("introductions")
          .update({
            status: "introduced",
            introduced_at: new Date().toISOString(),
            introduction_method: "whatsapp_group",
          })
          .eq("id", introductionId);

        const introMessage = `Great news! I've connected you both. ${business.contact_name || business.company_name}, meet ${creator.name}. ${creator.name}, meet ${business.contact_name || business.company_name} (${business.company_name}). You two should discuss partnership details, timing, and creative. When you've agreed on terms, message me and I'll set up the payment.`;

        // Message to business
        if (business.phone) {
          const bizSid = await sendWhatsAppMessage(
            business.phone as string,
            introMessage
          );
          await supabase.from("agent_messages").insert({
            direction: "outbound",
            user_type: "business",
            user_id: business.id,
            phone: business.phone,
            content: introMessage,
            message_type: "introduction_made",
            related_introduction_id: introductionId,
            external_id: bizSid,
          });
        }

        // Message to creator
        if (creator.phone) {
          const crSid = await sendWhatsAppMessage(creator.phone, introMessage);
          await supabase.from("agent_messages").insert({
            direction: "outbound",
            user_type: creator.type,
            user_id: creator.profile.id,
            phone: creator.phone,
            content: introMessage,
            message_type: "introduction_made",
            related_introduction_id: introductionId,
            external_id: crSid,
          });
        }
      }
    } else if (response === "decline") {
      newStatus = "newsletter_declined";
      await supabase
        .from("introductions")
        .update({
          status: "newsletter_declined",
          newsletter_response_at: new Date().toISOString(),
        })
        .eq("id", introductionId);

      if (creator.phone) {
        const ackMsg =
          "No problem! I'll only send you opportunities that are a great fit.";
        const crSid = await sendWhatsAppMessage(creator.phone, ackMsg);
        await supabase.from("agent_messages").insert({
          direction: "outbound",
          user_type: creator.type,
          user_id: creator.profile.id,
          phone: creator.phone,
          content: ackMsg,
          message_type: "decline_ack",
          related_introduction_id: introductionId,
          external_id: crSid,
        });
      }

      if (business.phone) {
        const bizNotifyMsg = `The ${creatorLabel} wasn't available this time. I'll find other matches for you.`;
        const bizSid = await sendWhatsAppMessage(
          business.phone as string,
          bizNotifyMsg
        );
        await supabase.from("agent_messages").insert({
          direction: "outbound",
          user_type: "business",
          user_id: business.id,
          phone: business.phone,
          content: bizNotifyMsg,
          message_type: "newsletter_declined_notify",
          related_introduction_id: introductionId,
          external_id: bizSid,
        });
      }
    } else if (response === "tell_me_more") {
      if (creator.phone) {
        const detailMsg = `Here's more about ${business.company_name}:\n\n🏢 Company: ${business.company_name}\n📝 Product: ${business.product_description || "N/A"}\n👤 Target customer: ${business.target_customer || "N/A"}\n🎯 Campaign goal: ${business.campaign_goal || "N/A"}\n💰 Budget range: ${business.budget_range || "N/A"}\n📋 Description: ${business.description || "N/A"}\n\nWould you like me to connect you? Reply YES or NO.`;

        const messageSid = await sendWhatsAppMessage(creator.phone, detailMsg);

        await supabase.from("agent_messages").insert({
          direction: "outbound",
          user_type: creator.type,
          user_id: creator.profile.id,
          phone: creator.phone,
          content: detailMsg,
          message_type: "match_details",
          related_introduction_id: introductionId,
          external_id: messageSid,
        });
      }
    }
  }

  return Response.json({ success: true, newStatus });
}
