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
import { downloadWhatsAppMedia } from "@/lib/whatsapp-media";
import { checkRateLimit } from "@/lib/rate-limiter";

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
  // Verify Meta webhook signature (fail-closed: reject if signature missing when secret is configured)
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const appSecret = process.env.META_APP_SECRET;

  if (appSecret) {
    if (!signature) {
      return new Response("Forbidden", { status: 403 });
    }
    const crypto = await import("crypto");
    const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
    if (signature !== expected) {
      console.error("Webhook signature mismatch");
      return new Response("Forbidden", { status: 403 });
    }
  }

  const payload = JSON.parse(rawBody);

  const entry = payload?.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;

  if (!value?.messages || value.messages.length === 0) {
    return new Response("OK", { status: 200 });
  }

  const message = value.messages[0];
  const phone = message.from;
  const phoneWithPlus = `+${phone}`;
  const messageText = message.text?.body || "";
  const messageId = message.id;
  const mediaUrl = message.image?.id || message.document?.id || null;

  if (!phone) return new Response("OK", { status: 200 });

  // Rate limiting — prevent abuse
  const rateCheck = checkRateLimit(phone);
  if (!rateCheck.allowed) {
    return new Response("OK", { status: 200 }); // Silently drop — don't reveal rate limit to attacker
  }

  const supabase = createServiceClient();

  // Idempotency: skip if already processed
  if (messageId) {
    const { data: existing } = await supabase
      .from("agent_messages")
      .select("id")
      .eq("whatsapp_message_id", messageId)
      .maybeSingle();
    if (existing) return new Response("OK", { status: 200 });
  }

  // Cap input length
  let body = messageText;
  if (messageText.length > 500) {
    body = messageText.slice(0, 500);
    await supabase.from("flagged_messages").insert({
      phone: phoneWithPlus, content: messageText.slice(0, 1000), flag_reason: "message_too_long",
    });
  }

  // Log inbound message synchronously (before returning 200)
  // This ensures the message is always saved even if background processing fails
  const userLookup = await lookupUser(supabase, phone, phoneWithPlus);
  await insertMessage({
    direction: "inbound",
    user_type: userLookup?.userType || null,
    user_id: userLookup?.userId || null,
    phone: phoneWithPlus,
    content: body,
    whatsapp_message_id: messageId,
    media_url: mediaUrl,
    media_count: mediaUrl ? 1 : 0,
  });

  // Heavy processing (AI, Stripe, etc.) in background
  after(async () => {
    try {
      if (userLookup) {
        await handleKnownUser(supabase, {
          phoneWithPlus, body, mediaUrl,
          userType: userLookup.userType, userId: userLookup.userId,
        });
      } else {
        await handleNewUser(supabase, { phoneWithPlus, body });
      }
    } catch (err) {
      console.error("Background processing error:", err);
    }
  });

  return new Response("OK", { status: 200 });
}

// ── User lookup ──
async function lookupUser(
  supabase: ReturnType<typeof createServiceClient>,
  phone: string,
  phoneWithPlus: string
): Promise<{ userType: "newsletter" | "business" | "other"; userId: string } | null> {
  const [nr, br, or_] = await Promise.all([
    supabase.from("newsletter_profiles").select("id").or(`phone.eq.${phoneWithPlus},phone.eq.${phone}`).maybeSingle(),
    supabase.from("business_profiles").select("id").or(`phone.eq.${phoneWithPlus},phone.eq.${phone}`).maybeSingle(),
    supabase.from("other_profiles").select("id").or(`phone.eq.${phoneWithPlus},phone.eq.${phone}`).maybeSingle(),
  ]);
  if (nr.data) return { userType: "newsletter", userId: nr.data.id };
  if (br.data) return { userType: "business", userId: br.data.id };
  if (or_.data) return { userType: "other", userId: or_.data.id };
  return null;
}

// ── Known user handler with pre-AI classification ──
async function handleKnownUser(
  supabase: ReturnType<typeof createServiceClient>,
  params: {
    phoneWithPlus: string;
    body: string;
    mediaUrl: string | null;
    userType: "newsletter" | "business" | "other";
    userId: string;
  }
) {
  const { phoneWithPlus, body, mediaUrl, userType, userId } = params;

  // Inbound already logged synchronously before after(). Just handle the response.

  // Handle image messages — run verification if from a newsletter owner
  if (mediaUrl && userType === "newsletter") {
    try {
      const media = await downloadWhatsAppMedia(mediaUrl);
      if (media && media.mimeType.startsWith("image/")) {
        // Forward to the verification endpoint internally
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://stroby.ai";
        const formData = new FormData();
        formData.append("file", new Blob([new Uint8Array(media.buffer)], { type: media.mimeType }), `whatsapp_${Date.now()}.jpg`);
        formData.append("newsletterId", userId);

        await fetch(`${appUrl}/api/verify/upload`, {
          method: "POST",
          body: formData,
        });
        // The upload endpoint handles all WhatsApp messaging
        return;
      }
    } catch (err) {
      console.error("WhatsApp image verification error:", err);
    }
  }

  // Handle image from business/other — analyze and save context
  if (mediaUrl && userType !== "newsletter") {
    try {
      const media = await downloadWhatsAppMedia(mediaUrl);
      if (media && media.mimeType.startsWith("image/")) {
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
        const base64 = media.buffer.toString("base64");

        const result = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 100,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: media.mimeType as "image/png" | "image/jpeg" | "image/webp" | "image/gif", data: base64 } },
              { type: "text", text: "Describe this image in one sentence. Focus on what product, brand, or business it represents." },
            ],
          }],
        });

        const description = result.content[0].type === "text" ? result.content[0].text : "";
        if (description) {
          const table = userType === "business" ? "business_profiles" : "other_profiles";
          const { data: current } = await supabase.from(table).select("description").eq("id", userId).single();
          const existingDesc = (current?.description as string) || "";
          const newDesc = existingDesc
            ? `${existingDesc} | Image context: ${description}`
            : `Image context: ${description}`;
          await supabase.from(table).update({ description: newDesc }).eq("id", userId);

          await sendAndLog(phoneWithPlus, `Got it — I've noted that for your profile. This helps me find better matches for you!`, userType, userId);
          return;
        }
      }
    } catch (err) {
      console.error("Business image analysis error:", err);
    }
  }

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

  // Status check — show profile summary
  if (intent.type === "status_check") {
    const { calculateCompleteness } = await import("@/lib/profile-completeness");
    const table = userType === "newsletter" ? "newsletter_profiles"
      : userType === "business" ? "business_profiles" : "other_profiles";
    const { data: fullProfile } = await supabase.from(table).select("*").eq("id", userId).single();

    if (fullProfile) {
      const { score, missing } = calculateCompleteness(fullProfile, userType === "other" ? "newsletter" : userType);
      const name = fullProfile.newsletter_name || fullProfile.company_name || fullProfile.name || "there";
      const niche = fullProfile.primary_niche || fullProfile.niche || "Not set";
      const verified = fullProfile.verification_status && fullProfile.verification_status !== "unverified" ? "Yes ✅" : "Not yet";

      // Count potential matches
      const matchTable = userType === "newsletter" ? "business_profiles" : "newsletter_profiles";
      const { count: potentialMatches } = await supabase
        .from(matchTable).select("id", { count: "exact", head: true })
        .eq("primary_niche", niche).eq("is_active", true);

      const profileLink = fullProfile.slug ? `\n🔗 Your profile: ${process.env.NEXT_PUBLIC_APP_URL || "https://stroby.ai"}/creator/${fullProfile.slug}` : "";

      const statusMsg = `Here's your Stroby profile, *${name}*:\n\n🎯 Niche: ${niche}\n📊 Profile: ${score}% complete${missing.length > 0 ? `\n📝 Missing: ${missing.slice(0, 3).join(", ")}` : ""}\n✅ Verified: ${verified}\n🔍 Potential matches in your niche: ${potentialMatches || 0}${profileLink}\n\nAnything you'd like to update?`;

      await sendAndLog(phoneWithPlus, statusMsg, userType, userId);
    }
    return;
  }

  // Verify request — send verification link
  if (intent.type === "verify_request" && userType === "newsletter") {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://stroby.ai";
    const verifyMsg = `Here's your verification link:\n\n${appUrl}/verify/${userId}\n\nConnect your newsletter platform or upload a screenshot. Verified creators get prioritized in matching!`;
    await sendAndLog(phoneWithPlus, verifyMsg, userType, userId);
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

  // Accept/decline/tell_me_more — only intercept if there's a pending intro
  if (intent.type === "accept" || intent.type === "decline" || intent.type === "tell_me_more") {
    const introColumn = userType === "newsletter" ? "newsletter_id" : "business_id";
    const pendingStatuses = userType === "business" ? ["suggested"] : ["business_accepted"];

    const { data: pendingIntro } = await supabase.from("introductions")
      .select("id").eq(introColumn, userId).in("status", pendingStatuses)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    if (pendingIntro) {
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
      return;
    }
    // No pending intro — fall through to AI (user might be saying "yes" to something else)
  }

  // ── Needs AI — send to agent (with error recovery) ──
  let responseText: string;
  try {
    const agentResult = await handleInboundMessage(phoneWithPlus, body, mediaUrl || undefined);
    responseText = await processAgentResponse(
      phoneWithPlus, userType === "other" ? "newsletter" : userType, userId, agentResult.response
    );
  } catch (err) {
    console.error("AI agent error:", err);
    await sendAndLog(
      phoneWithPlus,
      "I'm having a brief moment — try again in a few seconds! If it keeps happening, just let me know what you need in a new message.",
      userType,
      userId
    );
    return;
  }

  // Strip markers
  const shouldSendStripeLink = responseText.includes("[SEND_STRIPE_LINK]");
  const shouldFlagOfftopic = responseText.includes("[FLAG_OFFTOPIC]");
  const shouldUpdateProfile = responseText.includes("[PROFILE_UPDATE]");
  const shouldSendVerifyLink = responseText.includes("[SEND_VERIFY_LINK]");
  const cleanResponse = responseText
    .replace(/\[SEND_STRIPE_LINK\]/g, "")
    .replace(/\[FLAG_OFFTOPIC\]/g, "")
    .replace(/\[PROFILE_UPDATE\]\s*\{[\s\S]*?\}/g, "")
    .replace(/\[SEND_VERIFY_LINK\]/g, "")
    .trim();

  if (shouldFlagOfftopic) {
    await supabase.from("flagged_messages").insert({
      user_id: userId, user_type: userType, phone: phoneWithPlus,
      content: body, flag_reason: "off_topic",
    });
  }

  // Profile auto-update from conversation (whitelisted fields only)
  if (shouldUpdateProfile) {
    const ALLOWED_FIELDS: Record<string, string[]> = {
      newsletter: ["subscriber_count", "avg_open_rate", "avg_ctr", "price_per_placement", "primary_niche", "description"],
      business: ["target_customer", "budget_range", "primary_niche", "campaign_goal", "description", "product_description"],
      other: ["description", "niche", "objectives", "looking_for", "can_offer"],
    };
    const updateMatch = responseText.match(/\[PROFILE_UPDATE\]\s*(\{[\s\S]*?\})/);
    if (updateMatch) {
      try {
        const rawUpdates = JSON.parse(updateMatch[1]);
        const allowed = ALLOWED_FIELDS[userType] || [];
        const safeUpdates = Object.fromEntries(
          Object.entries(rawUpdates).filter(([key]) => allowed.includes(key))
        );
        if (Object.keys(safeUpdates).length > 0) {
          const table = userType === "newsletter" ? "newsletter_profiles"
            : userType === "business" ? "business_profiles" : "other_profiles";
          await supabase.from(table).update(safeUpdates).eq("id", userId);
        }
      } catch { /* ignore parse errors */ }
    }
  }

  await sendWhatsAppMessage(phoneWithPlus, cleanResponse);

  if (shouldSendStripeLink && userType === "newsletter") {
    await generateAndSendStripeLink(supabase, phoneWithPlus, userId);
  }

  // Send verification link if requested
  if (shouldSendVerifyLink && userType === "newsletter" && userId) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://stroby.ai";
    const verifyMsg = `Here's your verification link:\n\n${appUrl}/verify/${userId}\n\nConnect your newsletter platform (Beehiiv, ConvertKit) or upload a screenshot. Verified creators get prioritized in matching!`;
    await sendWhatsAppMessage(phoneWithPlus, verifyMsg);
    await insertMessage({
      direction: "outbound", user_type: "newsletter", user_id: userId,
      phone: phoneWithPlus, content: verifyMsg, message_type: "verification",
    });
  }
}

// ── New user handler (onboarding) ──
async function handleNewUser(
  supabase: ReturnType<typeof createServiceClient>,
  params: { phoneWithPlus: string; body: string }
) {
  const { phoneWithPlus, body } = params;

  // Inbound already logged synchronously before after().

  let result;
  try {
    result = await handleOnboardingMessage(phoneWithPlus, body);
  } catch (err) {
    console.error("Onboarding AI error:", err);
    await sendWhatsAppMessage(phoneWithPlus, "Hey! I'm having a brief moment. Try messaging me again in a few seconds!");
    return;
  }

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

      // Send public profile link to creators
      if (profile.userType === "newsletter") {
        const { data: nlProfile } = await supabase
          .from("newsletter_profiles").select("slug").eq("id", profile.id).single();
        if (nlProfile?.slug) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://stroby.ai";
          const profileMsg = `Your public profile is live at ${appUrl}/creator/${nlProfile.slug} — feel free to share it in your bio!`;
          await sendWhatsAppMessage(phoneWithPlus, profileMsg);
        }
      }
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
