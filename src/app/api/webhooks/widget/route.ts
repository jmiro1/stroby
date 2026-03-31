import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, userType, name } = body;

    if (!phone || !userType || !name) {
      return Response.json(
        { error: "Missing required fields: phone, userType, name" },
        { status: 400 }
      );
    }

    if (userType !== "newsletter" && userType !== "business") {
      return Response.json(
        { error: 'Invalid userType. Must be "newsletter" or "business".' },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Look up the user to get their ID
    const table =
      userType === "newsletter" ? "newsletter_profiles" : "business_profiles";
    const { data: profile } = await supabase
      .from(table)
      .select("id")
      .eq("phone", phone)
      .maybeSingle();

    const welcomeMessage =
      userType === "newsletter"
        ? `Hey ${name}! Welcome to Stroby. We're excited to help you monetize your newsletter. Our agent will be in touch shortly to discuss opportunities.`
        : `Hey ${name}! Welcome to Stroby. We're excited to help you find the perfect newsletter placements. Our agent will be in touch shortly to discuss your campaign.`;

    // TODO: Send WhatsApp message via Twilio
    // import twilio from "twilio";
    // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    // await client.messages.create({
    //   from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
    //   to: `whatsapp:${phone}`,
    //   body: welcomeMessage,
    // });

    // Log the outbound message
    const { error } = await supabase.from("agent_messages").insert({
      direction: "outbound",
      user_type: userType,
      user_id: profile?.id || null,
      phone,
      content: welcomeMessage,
      // TODO: Add whatsapp_message_id from Twilio response once sending is implemented
    });

    if (error) {
      console.error("Failed to log outbound welcome message:", error);
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error("Widget webhook error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
