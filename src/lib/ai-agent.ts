import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "./supabase";

// Lazy-loaded Anthropic client
let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return _anthropic;
}

const SYSTEM_PROMPT = `You are Stroby, an AI sponsorship matchmaker that connects businesses with newsletter owners for paid sponsorship placements. You work for stroby.ai.

Your role:
- Onboard newsletter owners and businesses through conversational follow-ups
- Answer questions about the platform (escrow, guarantees, matching)
- Help users understand match suggestions
- Collect feedback and ratings
- Guide newsletter owners through Stripe Connect setup

Behavioral rules:
- Always be concise. Lead with data and specifics, not hype.
- Never pressure either side to accept a match. Respect declines gracefully.
- When discussing matches, include: newsletter name, niche, subscriber count, open rate, price, and reasoning.
- Never share one party's contact info until both have opted in.
- If you don't have a good match, say so honestly.
- Always explain the escrow/guarantee system when relevant.
- Keep responses under 300 words for WhatsApp readability.

You have context about the current user injected below. Use it to personalize your responses.`;

interface AgentResponse {
  response: string;
  action?: { type: string; data: Record<string, unknown> };
}

export async function handleInboundMessage(
  phone: string,
  messageBody: string,
  mediaUrl?: string
): Promise<AgentResponse> {
  const supabase = createServiceClient();

  // Look up phone in both profile tables
  const [newsletterResult, businessResult] = await Promise.all([
    supabase
      .from("newsletter_profiles")
      .select("*")
      .eq("phone", phone)
      .maybeSingle(),
    supabase
      .from("business_profiles")
      .select("*")
      .eq("phone", phone)
      .maybeSingle(),
  ]);

  const newsletterProfile = newsletterResult.data;
  const businessProfile = businessResult.data;

  if (!newsletterProfile && !businessProfile) {
    return {
      response:
        "Hi! I'm Stroby, your AI sponsorship matchmaker. Visit stroby.ai to get started.",
    };
  }

  const userType = newsletterProfile ? "newsletter" : "business";
  const profile = newsletterProfile || businessProfile;
  const userId = profile.id as string;

  // Fetch last 20 messages for conversation history
  const { data: recentMessages } = await supabase
    .from("agent_messages")
    .select("direction, content, created_at")
    .or(`user_id.eq.${userId}`)
    .order("created_at", { ascending: true })
    .limit(20);

  // Fetch pending introductions for this user
  const introColumn =
    userType === "newsletter" ? "newsletter_id" : "business_id";
  const { data: pendingIntros } = await supabase
    .from("introductions")
    .select("*, newsletter_profiles(*), business_profiles(*)")
    .eq(introColumn, userId)
    .in("status", ["suggested", "pending"]);

  // Build user context
  const userContext =
    userType === "newsletter"
      ? `User type: Newsletter Owner
Newsletter: ${profile.newsletter_name || "Unknown"}
Niche: ${profile.primary_niche || "Not set"}
Subscribers: ${profile.subscriber_count || "Unknown"}
Open rate: ${profile.avg_open_rate ? `${profile.avg_open_rate}%` : "Unknown"}
CTR: ${profile.avg_ctr ? `${profile.avg_ctr}%` : "Unknown"}
Price per placement: ${profile.price_per_placement ? `$${(profile.price_per_placement / 100).toFixed(2)}` : "Not set"}
Onboarding status: ${profile.onboarding_status || "Unknown"}
Stripe connected: ${profile.stripe_account_id ? "Yes" : "No"}`
      : `User type: Business
Company: ${profile.company_name || "Unknown"}
Product: ${profile.product_description || "Not set"}
Target customer: ${profile.target_customer || "Not set"}
Campaign goal: ${profile.campaign_goal || "Not set"}
Budget range: ${profile.budget_range || "Not set"}
Niche: ${profile.primary_niche || "Not set"}
Onboarding status: ${profile.onboarding_status || "Unknown"}`;

  const introContext =
    pendingIntros && pendingIntros.length > 0
      ? `\n\nPending match suggestions:\n${pendingIntros
          .map((intro: Record<string, unknown>, i: number) => {
            const other =
              userType === "newsletter"
                ? (intro.business_profiles as Record<string, unknown>)
                : (intro.newsletter_profiles as Record<string, unknown>);
            if (!other) return `${i + 1}. (details unavailable)`;
            return userType === "newsletter"
              ? `${i + 1}. ${other.company_name} - ${other.primary_niche} (Score: ${intro.match_score})`
              : `${i + 1}. ${other.newsletter_name} - ${other.primary_niche}, ${other.subscriber_count} subs, ${other.avg_open_rate}% open rate (Score: ${intro.match_score})`;
          })
          .join("\n")}`
      : "";

  // Build messages array for Claude
  const messages: Anthropic.MessageParam[] = [];

  if (recentMessages && recentMessages.length > 0) {
    for (const msg of recentMessages) {
      messages.push({
        role: msg.direction === "inbound" ? "user" : "assistant",
        content: (msg.content as string) || "",
      });
    }
  }

  // Add the current message
  const currentContent = mediaUrl
    ? `${messageBody || ""}\n[Media attached: ${mediaUrl}]`
    : messageBody || "";
  messages.push({ role: "user", content: currentContent });

  // Call Claude
  const anthropic = getAnthropic();
  const completion = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: `${SYSTEM_PROMPT}\n\n--- User Context ---\n${userContext}${introContext}`,
    messages,
  });

  const responseText =
    completion.content[0].type === "text" ? completion.content[0].text : "";

  return { response: responseText };
}

// Acceptance phrases
const ACCEPT_PHRASES = [
  "yes",
  "accept",
  "sounds good",
  "let's do it",
  "lets do it",
  "interested",
  "sure",
  "go ahead",
  "absolutely",
  "yeah",
  "yep",
  "yup",
  "ok",
  "okay",
  "connect us",
  "introduce us",
  "i'm in",
  "im in",
  "do it",
];

// Decline phrases
const DECLINE_PHRASES = [
  "no",
  "decline",
  "not right now",
  "pass",
  "skip",
  "not interested",
  "no thanks",
  "no thank you",
  "nah",
  "nope",
  "maybe later",
  "not now",
];

// "Tell me more" phrases
const MORE_INFO_PHRASES = [
  "tell me more",
  "more info",
  "more details",
  "details",
  "what else",
  "can you tell me more",
  "elaborate",
];

function detectIntent(
  content: string
): "accept" | "decline" | "tell_me_more" | null {
  const normalized = content.toLowerCase().trim();

  // Check "tell me more" first (more specific)
  for (const phrase of MORE_INFO_PHRASES) {
    if (normalized === phrase || normalized.includes(phrase)) {
      return "tell_me_more";
    }
  }

  // Check acceptance
  for (const phrase of ACCEPT_PHRASES) {
    if (normalized === phrase || normalized.includes(phrase)) {
      return "accept";
    }
  }

  // Check decline
  for (const phrase of DECLINE_PHRASES) {
    if (normalized === phrase || normalized.includes(phrase)) {
      return "decline";
    }
  }

  return null;
}

export async function processAgentResponse(
  phone: string,
  userType: "newsletter" | "business",
  userId: string,
  response: string
): Promise<string> {
  const supabase = createServiceClient();

  // Check for action keywords in the user's last inbound message
  const { data: lastInbound } = await supabase
    .from("agent_messages")
    .select("content")
    .eq("user_id", userId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastInbound?.content) {
    const content = (lastInbound.content as string).toLowerCase().trim();
    const intent = detectIntent(content);

    if (intent) {
      const introColumn =
        userType === "newsletter" ? "newsletter_id" : "business_id";

      // Determine which statuses to look for based on user type
      const pendingStatuses =
        userType === "business"
          ? ["suggested"]
          : ["business_accepted"]; // Newsletter responds to business_accepted intros

      // Find the most recent pending introduction for this user
      const { data: pendingIntro } = await supabase
        .from("introductions")
        .select("id, status")
        .eq(introColumn, userId)
        .in("status", pendingStatuses)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pendingIntro) {
        // Call the respond endpoint logic directly
        const respondPayload = {
          introductionId: pendingIntro.id,
          responderId: userId,
          responderType: userType,
          response: intent,
        };

        try {
          const baseUrl =
            process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
          await fetch(`${baseUrl}/api/introductions/respond`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(respondPayload),
          });
        } catch (err) {
          console.error("Failed to process introduction response:", err);
        }
      }
    }

    // Check for rating (1-5) - independent of introduction responses
    const ratingMatch = content.match(/^(\d)(?:\s*(?:\/5|out of 5|stars?))?$/);
    if (ratingMatch) {
      const rating = parseInt(ratingMatch[1], 10);
      if (rating >= 1 && rating <= 5) {
        const introColumn =
          userType === "newsletter" ? "newsletter_id" : "business_id";
        const ratingColumn =
          userType === "newsletter"
            ? "newsletter_rating"
            : "business_rating";

        await supabase
          .from("introductions")
          .update({ [ratingColumn]: rating })
          .eq(introColumn, userId)
          .in("status", ["completed", "introduced"])
          .order("created_at", { ascending: false })
          .limit(1);
      }
    }
  }

  // Log the outbound message
  await supabase.from("agent_messages").insert({
    direction: "outbound",
    user_type: userType,
    user_id: userId,
    phone,
    content: response,
  });

  return response;
}
