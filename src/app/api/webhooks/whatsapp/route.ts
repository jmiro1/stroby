import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { handleInboundMessage, processAgentResponse } from "@/lib/ai-agent";
import { sendWhatsAppMessage } from "@/lib/twilio";

// ── GET: Meta webhook verification (required for setup) ──
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const verifyToken = "stroby-verify-token";

  if (mode === "subscribe" && token === verifyToken) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

// ── POST: Incoming WhatsApp messages from Meta Cloud API ──
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    // Meta sends various webhook events; we only care about messages
    const entry = payload?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    // Check if this is a message event (not a status update)
    if (!value?.messages || value.messages.length === 0) {
      // Could be a status update (delivered, read, etc.) — acknowledge silently
      return new Response("OK", { status: 200 });
    }

    const message = value.messages[0];
    const phone = message.from; // e.g., "15551682562" (no + prefix from Meta)
    const phoneWithPlus = `+${phone}`;
    const body = message.text?.body || "";
    const messageId = message.id;
    const mediaUrl = message.image?.id || message.document?.id || null;

    if (!phone) {
      console.warn("WhatsApp webhook received without sender number");
      return new Response("OK", { status: 200 });
    }

    const supabase = createServiceClient();

    // Look up the phone number in all profile tables
    // Try both with and without + prefix since users may have entered either format
    const [newsletterResult, businessResult, otherResult] = await Promise.all([
      supabase
        .from("newsletter_profiles")
        .select("id")
        .or(`phone.eq.${phoneWithPlus},phone.eq.${phone}`)
        .maybeSingle(),
      supabase
        .from("business_profiles")
        .select("id")
        .or(`phone.eq.${phoneWithPlus},phone.eq.${phone}`)
        .maybeSingle(),
      supabase
        .from("other_profiles")
        .select("id")
        .or(`phone.eq.${phoneWithPlus},phone.eq.${phone}`)
        .maybeSingle(),
    ]);

    const newsletterProfile = newsletterResult.data;
    const businessProfile = businessResult.data;
    const otherProfile = otherResult.data;

    let userType: "newsletter" | "business" | "other" | null = null;
    let userId: string | null = null;

    if (newsletterProfile) {
      userType = "newsletter";
      userId = newsletterProfile.id;
    } else if (businessProfile) {
      userType = "business";
      userId = businessProfile.id;
    } else if (otherProfile) {
      userType = "other";
      userId = otherProfile.id;
    }

    if (userType && userId) {
      // Log the inbound message
      await supabase.from("agent_messages").insert({
        direction: "inbound",
        user_type: userType,
        user_id: userId,
        phone: phoneWithPlus,
        content: body,
        whatsapp_message_id: messageId,
        media_url: mediaUrl,
        media_count: mediaUrl ? 1 : 0,
      });

      // Process the message through the AI agent
      const agentResult = await handleInboundMessage(
        phoneWithPlus,
        body,
        mediaUrl || undefined
      );

      // Process the response for any actions (match acceptance, ratings, etc.)
      const responseText = await processAgentResponse(
        phoneWithPlus,
        userType === "other" ? "newsletter" : userType, // AI agent expects newsletter/business
        userId,
        agentResult.response
      );

      // Send the response via WhatsApp
      const outMessageId = await sendWhatsAppMessage(phoneWithPlus, responseText);
      if (outMessageId) {
        console.log("Sent WhatsApp response:", outMessageId);
      } else {
        console.log("WhatsApp message not sent. Response:", responseText);
      }
    } else {
      console.warn("WhatsApp message from unregistered number:", phoneWithPlus);

      const defaultResponse =
        "Hey! I'm Stroby, your AI Superconnector for brand distribution. Visit stroby.ai to get started!";
      await sendWhatsAppMessage(phoneWithPlus, defaultResponse);
    }

    // Always return 200 to Meta to prevent retries
    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("WhatsApp webhook error:", err);
    return new Response("OK", { status: 200 });
  }
}
