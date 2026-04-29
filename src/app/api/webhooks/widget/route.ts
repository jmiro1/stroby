import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { cleanPhoneStrict } from "@/lib/phone";
import { checkRateLimit } from "@/lib/rate-limiter";

// This endpoint is reachable by anonymous browser traffic from the widget.
// We can't use a shared secret (it'd live in the JS bundle), so defenses
// are: strict input validation, per-IP rate limit, and refusing to write
// orphan rows that don't match an existing profile.

const MAX_NAME_LEN = 100;

export async function POST(request: NextRequest) {
  try {
    // Per-IP rate limit (in-memory; resets on cold start). Same limiter
    // the WhatsApp webhook uses — 30 requests per hour per key.
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const rate = checkRateLimit(`widget:${ip}`);
    if (!rate.allowed) {
      // Drop silently — same pattern as WhatsApp webhook (don't reveal limit)
      return Response.json({ success: true });
    }

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

    // Strict digit-only phone, length-validated. Prevents PostgREST .or()
    // injection.
    const cleanPhone = cleanPhoneStrict(phone);
    if (!cleanPhone) {
      return Response.json({ error: "Invalid phone number" }, { status: 400 });
    }

    if (typeof name !== "string" || name.length === 0 || name.length > MAX_NAME_LEN) {
      return Response.json({ error: "Invalid name" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Only write the audit row if the phone matches a real profile.
    // Without this, anonymous traffic could fill agent_messages with
    // orphan rows.
    const table =
      userType === "newsletter" ? "newsletter_profiles" : "business_profiles";
    const { data: profile } = await supabase
      .from(table)
      .select("id")
      .or(`phone.eq.${cleanPhone},phone.eq.+${cleanPhone}`)
      .maybeSingle();

    if (!profile?.id) {
      // Don't error — preserves the "always 200" behavior expected by
      // the widget — but skip the DB write.
      return Response.json({ success: true });
    }

    const welcomeMessage =
      userType === "newsletter"
        ? `Hey ${name}! Welcome to Stroby. We're excited to help you monetize your newsletter. Our agent will be in touch shortly to discuss opportunities.`
        : `Hey ${name}! Welcome to Stroby. We're excited to help you find the perfect newsletter placements. Our agent will be in touch shortly to discuss your campaign.`;

    // TODO: Send WhatsApp message via Twilio
    // import twilio from "twilio";
    // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    // await client.messages.create({
    //   from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
    //   to: `whatsapp:+${cleanPhone}`,
    //   body: welcomeMessage,
    // });

    const { error } = await supabase.from("agent_messages").insert({
      direction: "outbound",
      user_type: userType,
      user_id: profile.id,
      phone: `+${cleanPhone}`,
      content: welcomeMessage,
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
