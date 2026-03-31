import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/twilio";

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
    responderType: "business" | "newsletter";
    response: "accept" | "decline" | "tell_me_more";
  } = body;

  if (!introductionId || !responderId || !responderType || !response) {
    return Response.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  // Fetch the introduction with joined profiles
  const { data: intro, error: introError } = await supabase
    .from("introductions")
    .select("*, business_profiles(*), newsletter_profiles(*)")
    .eq("id", introductionId)
    .single();

  if (introError || !intro) {
    return Response.json(
      { error: "Introduction not found" },
      { status: 404 }
    );
  }

  const business = intro.business_profiles as Record<string, unknown>;
  const newsletter = intro.newsletter_profiles as Record<string, unknown>;
  let newStatus = intro.status as string;

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

      // Send WhatsApp to newsletter owner asking if they want the intro
      if (newsletter.phone) {
        const priceDisplay = newsletter.price_per_placement
          ? `$${((newsletter.price_per_placement as number) / 100).toFixed(0)}`
          : "TBD";

        const nlMessage = `Hi ${newsletter.contact_name || newsletter.newsletter_name}! A business wants to sponsor your newsletter:\n\n🏢 ${business.company_name}\n🎯 Niche: ${business.primary_niche || "General"}\n📝 ${business.product_description || "N/A"}\n👤 Target: ${business.target_customer || "N/A"}\n💰 Your rate: ${priceDisplay} per placement\n\nMatch score: ${((intro.match_score as number) * 100).toFixed(0)}%\nWhy: ${intro.match_reasoning}\n\nWant me to connect you? Reply YES, NO, or TELL ME MORE.`;

        const messageSid = await sendWhatsAppMessage(
          newsletter.phone as string,
          nlMessage
        );

        await supabase.from("agent_messages").insert({
          direction: "outbound",
          user_type: "newsletter",
          user_id: newsletter.id,
          phone: newsletter.phone,
          content: nlMessage,
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

      // Send graceful acknowledgment
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
      // Send more details about the newsletter (without contact info)
      if (business.phone) {
        const detailMsg = `Here's more about ${newsletter.newsletter_name}:\n\n📰 Niche: ${newsletter.primary_niche || "General"}\n📝 ${newsletter.description || "No description available"}\n👥 ${newsletter.subscriber_count || "N/A"} subscribers\n📊 ${newsletter.avg_open_rate || "N/A"}% open rate | ${newsletter.avg_ctr || "N/A"}% CTR\n✅ API verified: ${newsletter.api_verified ? "Yes" : "No"}\n⭐ Avg rating: ${newsletter.avg_match_rating || "New"}\n\nWould you like me to introduce you? Reply YES or NO.`;

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

  // --- NEWSLETTER RESPONDS ---
  if (responderType === "newsletter") {
    if (response === "accept") {
      newStatus = "newsletter_accepted";
      await supabase
        .from("introductions")
        .update({
          status: "newsletter_accepted",
          newsletter_response_at: new Date().toISOString(),
        })
        .eq("id", introductionId);

      // Check if double opt-in is complete (business already accepted)
      if (
        intro.status === "business_accepted" ||
        newStatus === "newsletter_accepted"
      ) {
        // Double opt-in complete - make the introduction
        newStatus = "introduced";
        await supabase
          .from("introductions")
          .update({
            status: "introduced",
            introduced_at: new Date().toISOString(),
            introduction_method: "email",
          })
          .eq("id", introductionId);

        // Send confirmation to both parties
        const introMessage = `Great news! I've connected you both. ${business.contact_name || business.company_name}, meet ${newsletter.contact_name || newsletter.newsletter_name} (${newsletter.newsletter_name}). ${newsletter.contact_name || newsletter.newsletter_name}, meet ${business.contact_name || business.company_name} (${business.company_name}). You two should discuss placement details, timing, and creative. When you've agreed on terms, message me and I'll set up the payment.`;

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

        // Message to newsletter
        if (newsletter.phone) {
          const nlSid = await sendWhatsAppMessage(
            newsletter.phone as string,
            introMessage
          );
          await supabase.from("agent_messages").insert({
            direction: "outbound",
            user_type: "newsletter",
            user_id: newsletter.id,
            phone: newsletter.phone,
            content: introMessage,
            message_type: "introduction_made",
            related_introduction_id: introductionId,
            external_id: nlSid,
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

      // Send acknowledgment to newsletter owner
      if (newsletter.phone) {
        const nlAckMsg =
          "No problem! I'll only send you opportunities that are a great fit.";
        const nlSid = await sendWhatsAppMessage(
          newsletter.phone as string,
          nlAckMsg
        );
        await supabase.from("agent_messages").insert({
          direction: "outbound",
          user_type: "newsletter",
          user_id: newsletter.id,
          phone: newsletter.phone,
          content: nlAckMsg,
          message_type: "decline_ack",
          related_introduction_id: introductionId,
          external_id: nlSid,
        });
      }

      // Notify the business
      if (business.phone) {
        const bizNotifyMsg = `The newsletter owner wasn't available this time. I'll find other matches for you.`;
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
      // Send more details about the business (without contact info)
      if (newsletter.phone) {
        const detailMsg = `Here's more about ${business.company_name}:\n\n🏢 Company: ${business.company_name}\n📝 Product: ${business.product_description || "N/A"}\n👤 Target customer: ${business.target_customer || "N/A"}\n🎯 Campaign goal: ${business.campaign_goal || "N/A"}\n💰 Budget range: ${business.budget_range || "N/A"}\n📋 Description: ${business.description || "N/A"}\n\nWould you like me to connect you? Reply YES or NO.`;

        const messageSid = await sendWhatsAppMessage(
          newsletter.phone as string,
          detailMsg
        );

        await supabase.from("agent_messages").insert({
          direction: "outbound",
          user_type: "newsletter",
          user_id: newsletter.id,
          phone: newsletter.phone,
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
