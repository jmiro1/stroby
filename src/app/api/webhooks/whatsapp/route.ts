import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { handleInboundMessage, processAgentResponse } from "@/lib/ai-agent";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { getStripe } from "@/lib/stripe";
import { insertMessage } from "@/lib/secure-messages";
import {
  handleOnboardingMessage,
  createProfileFromOnboarding,
  linkExistingAccount,
} from "@/lib/whatsapp-onboarding";

// ── GET: Meta webhook verification (required for setup) ──
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "stroby-verify-token";

  if (mode === "subscribe" && token === verifyToken) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

// ── POST: Incoming WhatsApp messages from Meta Cloud API ──
export async function POST(request: NextRequest) {
  try {
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

    const supabase = createServiceClient();

    // Token optimization: cap input at 500 chars
    const MAX_INPUT_CHARS = 500;
    let body = rawBody;
    if (rawBody.length > MAX_INPUT_CHARS) {
      body = rawBody.slice(0, MAX_INPUT_CHARS);
      await supabase.from("flagged_messages").insert({
        phone: phoneWithPlus,
        content: rawBody.slice(0, 1000),
        flag_reason: "message_too_long",
      });
    }

    // Look up phone in all profile tables
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
      // ── Known user ──
      await insertMessage({
        direction: "inbound",
        user_type: userType,
        user_id: userId,
        phone: phoneWithPlus,
        content: body,
        whatsapp_message_id: messageId,
        media_url: mediaUrl,
        media_count: mediaUrl ? 1 : 0,
      });

      const agentResult = await handleInboundMessage(phoneWithPlus, body, mediaUrl || undefined);
      const responseText = await processAgentResponse(
        phoneWithPlus,
        userType === "other" ? "newsletter" : userType,
        userId,
        agentResult.response
      );

      // Strip markers
      const shouldSendStripeLink = responseText.includes("[SEND_STRIPE_LINK]");
      const shouldFlagOfftopic = responseText.includes("[FLAG_OFFTOPIC]");
      const cleanResponse = responseText
        .replace(/\[SEND_STRIPE_LINK\]/g, "")
        .replace(/\[FLAG_OFFTOPIC\]/g, "")
        .trim();

      if (shouldFlagOfftopic) {
        await supabase.from("flagged_messages").insert({
          user_id: userId, user_type: userType, phone: phoneWithPlus,
          content: body, flag_reason: "off_topic",
        });
      }

      const outMessageId = await sendWhatsAppMessage(phoneWithPlus, cleanResponse);
      if (outMessageId) {
        console.log("Sent WhatsApp response:", outMessageId);
      }

      // Stripe Connect link generation
      if (shouldSendStripeLink && userType === "newsletter" && userId) {
        try {
          const stripe = getStripe();
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://stroby.ai";

          const { data: nlProfile } = await supabase
            .from("newsletter_profiles")
            .select("stripe_account_id, email")
            .eq("id", userId).single();

          if (nlProfile && !nlProfile.stripe_account_id) {
            const account = await stripe.accounts.create({
              type: "express",
              email: nlProfile.email || undefined,
              metadata: { profile_id: userId },
            });

            await supabase.from("newsletter_profiles")
              .update({ stripe_account_id: account.id })
              .eq("id", userId);

            const accountLink = await stripe.accountLinks.create({
              account: account.id,
              refresh_url: `${appUrl}/stripe/connect?refresh=true&id=${userId}`,
              return_url: `${appUrl}/stripe/connect/complete?id=${userId}`,
              type: "account_onboarding",
            });

            const stripeMsg = `Here's your secure Stripe setup link:\n\n${accountLink.url}\n\nThis is optional — you can also work out payment directly with your partner.`;
            await sendWhatsAppMessage(phoneWithPlus, stripeMsg);
            await insertMessage({
              direction: "outbound", user_type: "newsletter", user_id: userId,
              phone: phoneWithPlus, content: stripeMsg, message_type: "stripe_connect",
            });
          } else if (nlProfile?.stripe_account_id) {
            await sendWhatsAppMessage(phoneWithPlus, "Your Stripe is already connected! You're all set to receive payments.");
          }
        } catch (err) {
          console.error("Failed to generate Stripe link:", err);
          await sendWhatsAppMessage(phoneWithPlus, "Sorry, I had trouble generating your Stripe link. Try again in a moment!");
        }
      }
    } else {
      // ── Unregistered number — WhatsApp onboarding ──
      await insertMessage({
        direction: "inbound", user_type: null, user_id: null,
        phone: phoneWithPlus, content: body, whatsapp_message_id: messageId,
      });

      const result = await handleOnboardingMessage(phoneWithPlus, body);

      if (result.linkAccount && result.linkData) {
        const linkResult = await linkExistingAccount(phoneWithPlus, result.linkData);
        const linkResponse = linkResult.found
          ? `Found your account — *${linkResult.name}*! I've updated your phone number. You're all set!`
          : "I couldn't find an account with that info. Want to try again, or set up a new profile here?";
        await sendWhatsAppMessage(phoneWithPlus, linkResponse);
        await insertMessage({
          direction: "outbound", phone: phoneWithPlus,
          content: linkResponse, message_type: "onboarding",
        });
      } else if (result.profileComplete && result.profileData) {
        const profile = await createProfileFromOnboarding(phoneWithPlus, result.profileData);
        await sendWhatsAppMessage(phoneWithPlus, result.response);
        await insertMessage({
          direction: "outbound", user_type: profile?.userType || null,
          user_id: profile?.id || null, phone: phoneWithPlus,
          content: result.response, message_type: "onboarding",
        });
        if (profile) {
          // Link all previous onboarding messages to the new profile
          // Note: can't update encrypted content, just the user_id/type
          await supabase.from("agent_messages")
            .update({ user_id: profile.id, user_type: profile.userType })
            .eq("phone", phoneWithPlus).is("user_id", null);
        }
      } else {
        await sendWhatsAppMessage(phoneWithPlus, result.response);
        await insertMessage({
          direction: "outbound", phone: phoneWithPlus,
          content: result.response, message_type: "onboarding",
        });
      }
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("WhatsApp webhook error:", err);
    return new Response("OK", { status: 200 });
  }
}
