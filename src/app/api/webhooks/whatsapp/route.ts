import { NextRequest, after } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { handleInboundMessage, processAgentResponse } from "@/lib/ai-agent";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { getStripe } from "@/lib/stripe";
import { insertMessage } from "@/lib/secure-messages";
import { classifyIntent, CANNED_RESPONSES } from "@/lib/intent-classifier";
import {
  handleOnboardingMessage,
  createProfileFromOnboarding,
  linkExistingAccount,
} from "@/lib/whatsapp-onboarding";

// ── GET: Meta webhook verification ──
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === (process.env.WHATSAPP_VERIFY_TOKEN || "stroby-verify-token")) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// ── POST: Incoming WhatsApp messages ──
export async function POST(request: NextRequest) {
  const payload = await request.json();

  const entry = payload?.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;

  if (!value?.messages || value.messages.length === 0) {
    return new Response("OK", { status: 200 });
  }

  const message = value.messages[0];
  const phone = message.from;
  const phoneWithPlus = `+${phone}`;
  const rawBody = message.text?.body || "";
  const messageId = message.id;
  const mediaUrl = message.image?.id || message.document?.id || null;

  if (!phone) return new Response("OK", { status: 200 });

  // Return 200 immediately — process in background
  after(async () => {
    try {
      await processIncomingMessage({
        phone, phoneWithPlus, rawBody, messageId, mediaUrl,
      });
    } catch (err) {
      console.error("Background message processing error:", err);
    }
  });

  return new Response("OK", { status: 200 });
}

// ── Background message processor ──
async function processIncomingMessage(params: {
  phone: string;
  phoneWithPlus: string;
  rawBody: string;
  messageId: string;
  mediaUrl: string | null;
}) {
  const { phone, phoneWithPlus, rawBody, messageId, mediaUrl } = params;
  const supabase = createServiceClient();

  // Idempotency: skip if we already processed this message
  if (messageId) {
    const { data: existing } = await supabase
      .from("agent_messages")
      .select("id")
      .eq("whatsapp_message_id", messageId)
      .maybeSingle();
    if (existing) return; // Already processed
  }

  // Cap input length
  let body = rawBody;
  if (rawBody.length > 500) {
    body = rawBody.slice(0, 500);
    await supabase.from("flagged_messages").insert({
      phone: phoneWithPlus, content: rawBody.slice(0, 1000), flag_reason: "message_too_long",
    });
  }

  // Look up user
  const [newsletterResult, businessResult, otherResult] = await Promise.all([
    supabase.from("newsletter_profiles").select("id")
      .or(`phone.eq.${phoneWithPlus},phone.eq.${phone}`).maybeSingle(),
    supabase.from("business_profiles").select("id")
      .or(`phone.eq.${phoneWithPlus},phone.eq.${phone}`).maybeSingle(),
    supabase.from("other_profiles").select("id")
      .or(`phone.eq.${phoneWithPlus},phone.eq.${phone}`).maybeSingle(),
  ]);

  let userType: "newsletter" | "business" | "other" | null = null;
  let userId: string | null = null;

  if (newsletterResult.data) { userType = "newsletter"; userId = newsletterResult.data.id; }
  else if (businessResult.data) { userType = "business"; userId = businessResult.data.id; }
  else if (otherResult.data) { userType = "other"; userId = otherResult.data.id; }

  if (userType && userId) {
    await handleKnownUser(supabase, { phoneWithPlus, body, messageId, mediaUrl, userType, userId });
  } else {
    await handleNewUser(supabase, { phoneWithPlus, body, messageId });
  }
}

// ── Known user handler with pre-AI classification ──
async function handleKnownUser(
  supabase: ReturnType<typeof createServiceClient>,
  params: {
    phoneWithPlus: string;
    body: string;
    messageId: string;
    mediaUrl: string | null;
    userType: "newsletter" | "business" | "other";
    userId: string;
  }
) {
  const { phoneWithPlus, body, messageId, mediaUrl, userType, userId } = params;

  // Log inbound
  await insertMessage({
    direction: "inbound", user_type: userType, user_id: userId,
    phone: phoneWithPlus, content: body, whatsapp_message_id: messageId,
    media_url: mediaUrl, media_count: mediaUrl ? 1 : 0,
  });

  // Pre-AI classification — handle simple intents without AI
  const intent = classifyIntent(body);

  if (intent.type === "greeting") {
    await sendAndLog(phoneWithPlus, CANNED_RESPONSES.greeting, userType, userId);
    return;
  }

  if (intent.type === "stop") {
    await sendAndLog(phoneWithPlus, CANNED_RESPONSES.stop, userType, userId);
    return;
  }

  if (intent.type === "rating") {
    const introColumn = userType === "newsletter" ? "newsletter_id" : "business_id";
    const ratingColumn = userType === "newsletter" ? "newsletter_rating" : "business_rating";
    await supabase.from("introductions")
      .update({ [ratingColumn]: intent.value })
      .eq(introColumn, userId)
      .in("status", ["completed", "introduced"])
      .order("created_at", { ascending: false }).limit(1);
    await sendAndLog(phoneWithPlus, `Thanks for the ${intent.value}/5 rating! That helps me find you better matches.`, userType, userId);
    return;
  }

  if (intent.type === "stripe_request" && userType === "newsletter") {
    await sendAndLog(phoneWithPlus, "I'll send you a secure setup link right now!", userType, userId);
    await generateAndSendStripeLink(supabase, phoneWithPlus, userId);
    return;
  }

  // Accept/decline/tell_me_more — check for pending intro first
  if (intent.type === "accept" || intent.type === "decline" || intent.type === "tell_me_more") {
    const introColumn = userType === "newsletter" ? "newsletter_id" : "business_id";
    const pendingStatuses = userType === "business" ? ["suggested"] : ["business_accepted"];

    const { data: pendingIntro } = await supabase.from("introductions")
      .select("id").eq(introColumn, userId).in("status", pendingStatuses)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    if (pendingIntro) {
      // Trigger the respond flow
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://stroby.ai";
      try {
        await fetch(`${baseUrl}/api/introductions/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            introductionId: pendingIntro.id,
            responderId: userId,
            responderType: userType === "other" ? "newsletter" : userType,
            response: intent.type,
          }),
        });
      } catch (err) {
        console.error("Failed to process intro response:", err);
      }
      // The respond endpoint sends its own WhatsApp messages
      return;
    }

    // No pending intro — send canned response
    const key = `${intent.type}_no_match`;
    const response = CANNED_RESPONSES[key] || CANNED_RESPONSES[`${intent.type.replace("tell_me_more", "more")}_no_match`] || "Nothing pending right now — I'll message you when I find a great match!";
    await sendAndLog(phoneWithPlus, response, userType, userId);
    return;
  }

  // ── Needs AI — send to agent ──
  const agentResult = await handleInboundMessage(phoneWithPlus, body, mediaUrl || undefined);
  const responseText = await processAgentResponse(
    phoneWithPlus, userType === "other" ? "newsletter" : userType, userId, agentResult.response
  );

  // Strip markers
  const shouldSendStripeLink = responseText.includes("[SEND_STRIPE_LINK]");
  const shouldFlagOfftopic = responseText.includes("[FLAG_OFFTOPIC]");
  const shouldUpdateProfile = responseText.includes("[PROFILE_UPDATE]");
  const cleanResponse = responseText
    .replace(/\[SEND_STRIPE_LINK\]/g, "")
    .replace(/\[FLAG_OFFTOPIC\]/g, "")
    .replace(/\[PROFILE_UPDATE\]\s*\{[\s\S]*?\}/g, "")
    .trim();

  if (shouldFlagOfftopic) {
    await supabase.from("flagged_messages").insert({
      user_id: userId, user_type: userType, phone: phoneWithPlus,
      content: body, flag_reason: "off_topic",
    });
  }

  // Profile auto-update from conversation
  if (shouldUpdateProfile) {
    const updateMatch = responseText.match(/\[PROFILE_UPDATE\]\s*(\{[\s\S]*?\})/);
    if (updateMatch) {
      try {
        const updates = JSON.parse(updateMatch[1]);
        const table = userType === "newsletter" ? "newsletter_profiles"
          : userType === "business" ? "business_profiles" : "other_profiles";
        await supabase.from(table).update(updates).eq("id", userId);
      } catch { /* ignore parse errors */ }
    }
  }

  await sendWhatsAppMessage(phoneWithPlus, cleanResponse);

  if (shouldSendStripeLink && userType === "newsletter") {
    await generateAndSendStripeLink(supabase, phoneWithPlus, userId);
  }
}

// ── New user handler (onboarding) ──
async function handleNewUser(
  supabase: ReturnType<typeof createServiceClient>,
  params: { phoneWithPlus: string; body: string; messageId: string }
) {
  const { phoneWithPlus, body, messageId } = params;

  await insertMessage({
    direction: "inbound", phone: phoneWithPlus, content: body,
    whatsapp_message_id: messageId,
  });

  const result = await handleOnboardingMessage(phoneWithPlus, body);

  if (result.linkAccount && result.linkData) {
    const linkResult = await linkExistingAccount(phoneWithPlus, result.linkData);
    const response = linkResult.found
      ? `Found your account — *${linkResult.name}*! I've updated your phone number. You're all set!`
      : "I couldn't find an account with that info. Want to try again, or set up a new profile here?";
    await sendWhatsAppMessage(phoneWithPlus, response);
    await insertMessage({ direction: "outbound", phone: phoneWithPlus, content: response, message_type: "onboarding" });
  } else if (result.profileComplete && result.profileData) {
    const profile = await createProfileFromOnboarding(phoneWithPlus, result.profileData);
    await sendWhatsAppMessage(phoneWithPlus, result.response);
    await insertMessage({
      direction: "outbound", user_type: profile?.userType || null,
      user_id: profile?.id || null, phone: phoneWithPlus,
      content: result.response, message_type: "onboarding",
    });
    if (profile) {
      await supabase.from("agent_messages")
        .update({ user_id: profile.id, user_type: profile.userType })
        .eq("phone", phoneWithPlus).is("user_id", null);
    }
  } else {
    await sendWhatsAppMessage(phoneWithPlus, result.response);
    await insertMessage({ direction: "outbound", phone: phoneWithPlus, content: result.response, message_type: "onboarding" });
  }
}

// ── Helpers ──
async function sendAndLog(phone: string, content: string, userType: string | null, userId: string | null) {
  await sendWhatsAppMessage(phone, content);
  await insertMessage({ direction: "outbound", user_type: userType, user_id: userId, phone, content });
}

async function generateAndSendStripeLink(
  supabase: ReturnType<typeof createServiceClient>,
  phone: string,
  userId: string
) {
  try {
    const stripe = getStripe();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://stroby.ai";

    const { data: nlProfile } = await supabase
      .from("newsletter_profiles")
      .select("stripe_account_id, email").eq("id", userId).single();

    if (nlProfile && !nlProfile.stripe_account_id) {
      const account = await stripe.accounts.create({
        type: "express", email: nlProfile.email || undefined,
        metadata: { profile_id: userId },
      });
      await supabase.from("newsletter_profiles")
        .update({ stripe_account_id: account.id }).eq("id", userId);

      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${appUrl}/stripe/connect?refresh=true&id=${userId}`,
        return_url: `${appUrl}/stripe/connect/complete?id=${userId}`,
        type: "account_onboarding",
      });

      const msg = `Here's your secure Stripe setup link:\n\n${accountLink.url}\n\nThis is optional — you can also work out payment directly with your partner.`;
      await sendWhatsAppMessage(phone, msg);
      await insertMessage({
        direction: "outbound", user_type: "newsletter", user_id: userId,
        phone, content: msg, message_type: "stripe_connect",
      });
    } else if (nlProfile?.stripe_account_id) {
      await sendWhatsAppMessage(phone, "Your Stripe is already connected! You're all set to receive payments.");
    }
  } catch (err) {
    console.error("Stripe link generation failed:", err);
    await sendWhatsAppMessage(phone, "Sorry, had trouble generating your Stripe link. Try again in a moment!");
  }
}
