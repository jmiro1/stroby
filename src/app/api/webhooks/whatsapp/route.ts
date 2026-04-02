import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { handleInboundMessage, processAgentResponse } from "@/lib/ai-agent";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { getStripe } from "@/lib/stripe";
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
    const rawBody = message.text?.body || "";
    const messageId = message.id;
    const mediaUrl = message.image?.id || message.document?.id || null;

    if (!phone) {
      console.warn("WhatsApp webhook received without sender number");
      return new Response("OK", { status: 200 });
    }

    const supabase = createServiceClient();

    // Token optimization: cap input at 500 chars (~125 tokens)
    const MAX_INPUT_CHARS = 500;
    let body = rawBody;
    if (rawBody.length > MAX_INPUT_CHARS) {
      body = rawBody.slice(0, MAX_INPUT_CHARS);
      // Flag the long message for review
      await supabase.from("flagged_messages").insert({
        user_id: null,
        user_type: null,
        phone: phoneWithPlus,
        content: rawBody.slice(0, 1000), // store up to 1k for review
        flag_reason: "message_too_long",
      });
    }

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

      // Strip markers before sending
      const shouldSendStripeLink = responseText.includes("[SEND_STRIPE_LINK]");
      const shouldFlagOfftopic = responseText.includes("[FLAG_OFFTOPIC]");
      const cleanResponse = responseText
        .replace(/\[SEND_STRIPE_LINK\]/g, "")
        .replace(/\[FLAG_OFFTOPIC\]/g, "")
        .trim();

      // Log off-topic messages for review
      if (shouldFlagOfftopic) {
        await supabase.from("flagged_messages").insert({
          user_id: userId,
          user_type: userType,
          phone: phoneWithPlus,
          content: body,
          flag_reason: "off_topic",
        });
      }

      // Send the response via WhatsApp
      const outMessageId = await sendWhatsAppMessage(phoneWithPlus, cleanResponse);
      if (outMessageId) {
        console.log("Sent WhatsApp response:", outMessageId);
      } else {
        console.log("WhatsApp message not sent. Response:", cleanResponse);
      }

      // Auto-generate and send Stripe Connect link if requested
      if (shouldSendStripeLink && userType === "newsletter" && userId) {
        try {
          const stripe = getStripe();
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://stroby.ai";

          // Check if already connected
          const { data: nlProfile } = await supabase
            .from("newsletter_profiles")
            .select("stripe_account_id, email")
            .eq("id", userId)
            .single();

          if (nlProfile && !nlProfile.stripe_account_id) {
            const account = await stripe.accounts.create({
              type: "express",
              email: nlProfile.email || undefined,
              metadata: { profile_id: userId },
            });

            await supabase
              .from("newsletter_profiles")
              .update({ stripe_account_id: account.id })
              .eq("id", userId);

            const accountLink = await stripe.accountLinks.create({
              account: account.id,
              refresh_url: `${appUrl}/stripe/connect?refresh=true&id=${userId}`,
              return_url: `${appUrl}/stripe/connect/complete?id=${userId}`,
              type: "account_onboarding",
            });

            const stripeMsg = `Here's your secure Stripe setup link:\n\n${accountLink.url}\n\nThis connects your account so you can receive payments through Stroby's escrow. It's optional — you can always work out payment directly with partners instead.`;
            await sendWhatsAppMessage(phoneWithPlus, stripeMsg);

            await supabase.from("agent_messages").insert({
              direction: "outbound",
              user_type: "newsletter",
              user_id: userId,
              phone: phoneWithPlus,
              content: stripeMsg,
              message_type: "stripe_connect",
            });
          } else if (nlProfile?.stripe_account_id) {
            await sendWhatsAppMessage(phoneWithPlus, "Your Stripe is already connected! You're all set to receive payments through escrow.");
          }
        } catch (err) {
          console.error("Failed to generate Stripe link:", err);
          await sendWhatsAppMessage(phoneWithPlus, "Sorry, I had trouble generating your Stripe link. Try again in a moment!");
        }
      }
    } else {
      // Unregistered number — run WhatsApp-native onboarding
      // Log inbound message (no user_id yet)
      await supabase.from("agent_messages").insert({
        direction: "inbound",
        user_type: null,
        user_id: null,
        phone: phoneWithPlus,
        content: body,
        whatsapp_message_id: messageId,
      });

      const result = await handleOnboardingMessage(phoneWithPlus, body);

      // Handle account linking
      if (result.linkAccount && result.linkData) {
        const linkResult = await linkExistingAccount(phoneWithPlus, result.linkData);
        let linkResponse: string;
        if (linkResult.found) {
          linkResponse = `Found your account — *${linkResult.name}*! I've updated your phone number to this WhatsApp. You're all set, feel free to message me anytime about matches!`;
        } else {
          linkResponse = "I couldn't find an account with that info. Want to try a different email or phone? Or we can set up a new profile right here!";
        }
        await sendWhatsAppMessage(phoneWithPlus, linkResponse);
        await supabase.from("agent_messages").insert({
          direction: "outbound",
          user_type: null,
          user_id: null,
          phone: phoneWithPlus,
          content: linkResponse,
          message_type: "onboarding",
        });
      }
      // Handle profile completion
      else if (result.profileComplete && result.profileData) {
        const profile = await createProfileFromOnboarding(phoneWithPlus, result.profileData);

        // Send the AI's confirmation message
        await sendWhatsAppMessage(phoneWithPlus, result.response);
        await supabase.from("agent_messages").insert({
          direction: "outbound",
          user_type: profile?.userType || null,
          user_id: profile?.id || null,
          phone: phoneWithPlus,
          content: result.response,
          message_type: "onboarding",
        });

        if (profile) {
          // Update all previous onboarding messages with the new user_id
          await supabase
            .from("agent_messages")
            .update({ user_id: profile.id, user_type: profile.userType })
            .eq("phone", phoneWithPlus)
            .is("user_id", null);
        }
      }
      // Normal onboarding conversation (still collecting info)
      else {
        await sendWhatsAppMessage(phoneWithPlus, result.response);
        await supabase.from("agent_messages").insert({
          direction: "outbound",
          user_type: null,
          user_id: null,
          phone: phoneWithPlus,
          content: result.response,
          message_type: "onboarding",
        });
      }
    }

    // Always return 200 to Meta to prevent retries
    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("WhatsApp webhook error:", err);
    return new Response("OK", { status: 200 });
  }
}
