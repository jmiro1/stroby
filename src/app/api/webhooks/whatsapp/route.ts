import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { handleInboundMessage, processAgentResponse } from "@/lib/ai-agent";
import { sendWhatsAppMessage } from "@/lib/twilio";

// TODO: Validate Twilio signature using X-Twilio-Signature header
// import twilio from "twilio";
// const isValid = twilio.validateRequest(authToken, signature, url, params);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const body = formData.get("Body") as string | null;
    const from = formData.get("From") as string | null; // e.g. "whatsapp:+1234567890"
    const to = formData.get("To") as string | null;
    const messageSid = formData.get("MessageSid") as string | null;
    const numMedia = parseInt(
      (formData.get("NumMedia") as string) || "0",
      10
    );
    const mediaUrl0 = formData.get("MediaUrl0") as string | null;

    // Extract raw phone number from "whatsapp:+1234567890" format
    const phone = from?.replace("whatsapp:", "") || null;

    if (!phone) {
      console.warn("WhatsApp webhook received without From number");
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { status: 200, headers: { "Content-Type": "text/xml" } }
      );
    }

    const supabase = createServiceClient();

    // Look up the phone number in both profile tables
    const [newsletterResult, businessResult] = await Promise.all([
      supabase
        .from("newsletter_profiles")
        .select("id")
        .eq("phone", phone)
        .maybeSingle(),
      supabase
        .from("business_profiles")
        .select("id")
        .eq("phone", phone)
        .maybeSingle(),
    ]);

    const newsletterProfile = newsletterResult.data;
    const businessProfile = businessResult.data;

    let userType: "newsletter" | "business" | null = null;
    let userId: string | null = null;

    if (newsletterProfile) {
      userType = "newsletter";
      userId = newsletterProfile.id;
    } else if (businessProfile) {
      userType = "business";
      userId = businessProfile.id;
    }

    if (userType && userId) {
      // Log the inbound message
      const { error } = await supabase.from("agent_messages").insert({
        direction: "inbound",
        user_type: userType,
        user_id: userId,
        phone,
        content: body,
        whatsapp_message_id: messageSid,
        media_url: mediaUrl0,
        media_count: numMedia,
      });

      if (error) {
        console.error("Failed to log inbound WhatsApp message:", error);
      }

      // Process the message through the AI agent
      const agentResult = await handleInboundMessage(
        phone,
        body || "",
        mediaUrl0 || undefined
      );

      // Process the response for any actions (match acceptance, ratings, etc.)
      const responseText = await processAgentResponse(
        phone,
        userType,
        userId,
        agentResult.response
      );

      // Send the response via WhatsApp
      // TODO: For production, ensure Twilio is fully configured
      const messageSidOut = await sendWhatsAppMessage(phone, responseText);
      if (messageSidOut) {
        console.log("Sent WhatsApp response:", messageSidOut);
      } else {
        console.log("WhatsApp message not sent (Twilio not configured). Response:", responseText);
      }
    } else {
      console.warn("WhatsApp message from unmatched number:", phone);

      // Send a default response for unknown numbers
      const defaultResponse =
        "Hi! I'm Stroby, your AI sponsorship matchmaker. Visit stroby.ai to get started.";
      await sendWhatsAppMessage(phone, defaultResponse);
    }

    // Return empty TwiML response (acknowledgment)
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { status: 200, headers: { "Content-Type": "text/xml" } }
    );
  } catch (err) {
    console.error("WhatsApp webhook error:", err);
    // Always return 200 to Twilio to prevent retries
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { status: 200, headers: { "Content-Type": "text/xml" } }
    );
  }
}
