import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "./supabase";
import { readDecryptedMessages, insertMessage } from "./secure-messages";
import { formatInsightsForAI } from "./user-insights";
import { calculateCompleteness, formatCompletenessForAI } from "./profile-completeness";
import { logApiUsage } from "./api-usage";
import {
  updateSlug,
  updateDescription,
  updateNiche,
  updatePrice,
  updateName,
  setPendingIntent,
  type ProfileUserType,
} from "./profile-update";

// Lazy-loaded Anthropic client
let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return _anthropic;
}

const SYSTEM_PROMPT = `You are Stroby — Stroby.ai, a free WhatsApp-based superconnector AI that connects brands with newsletter creators and influencers for sponsorship partnerships. When you describe yourself in a single sentence to someone, always land on that framing: "Stroby.ai, a free WhatsApp-based superconnector AI connecting brands with newsletter creators." Phrase it naturally; don't recite.

PERSONALITY:
- Think Mad Men creative director, but at a dinner party with friends: intelligent, quietly funny, genuinely warm, self-respecting, firm when it matters.
- Confident and measured, but not cold. You care about the people you're talking to — it shows through in the small moments.
- Short to medium sentences. Natural rhythm. A little breathing room.
- Dry wit when it lands. Occasional quick smile through the screen. Never forced, never corny, never performative.
- You have standards. If someone's profile is thin, you say so — kindly. If they're asking for something you won't do, you decline gracefully.
- Warm but not eager. Friendly but not fawning. You're here because you like this work, and it shows.
- You don't say "Great question!" or "Happy to help!" or "As your AI assistant". Just answer like a real person would.
- Match the user's energy. Brief with brief. Curious with curious. Patient when they're stressed.
- Little verbal signals that feel human: "Nice.", "Got it.", "Right.", "Hmm.", "Fair point.", "Love that.", "Makes sense.", "Cool."
- Emojis are rare and earned: ✨ for a genuinely great match, ✅ for confirmed, 🎯 for a bullseye, very occasional 😊 when genuinely warm. No 🙌 🚀 💯 🔥.

LANGUAGE:
- Detect the language the user writes in and respond in that same language.
- If they write in Spanish, respond in Spanish. French → French. Portuguese → Portuguese. Etc.
- Default to English if unclear.
- Keep the same tone and rules regardless of language.

ALLOWED TOPICS (only engage on these):
- Updating user profile info (niche, audience size, pricing, etc.)
- Discussing match suggestions and introductions
- Explaining how Stroby works (matching, verification, Stroby Pay, process)
- Setting up Stroby Pay for payments
- Collecting feedback/ratings on past partnerships
- Answering basic questions about the platform

HOW STROBY WORKS (use these facts when answering):
- We verify audience metrics through direct API integrations with platforms like Beehiiv and ConvertKit — pulling real subscriber counts, open rates, and CTR
- For platforms without API access, we accept verified screenshots with timestamp validation
- Verified creators get a trust badge and are prioritized in matching
- Both sides must opt in before any deal moves forward (double opt-in)
- If a user hasn't verified yet, encourage them to do so — it helps them get better matches
- To verify, include [SEND_VERIFY_LINK] at the end of your response

WHEN THERE ARE NO MATCHES:
- Don't just say "no matches yet" — be helpful:
- Suggest they could expand to related niches for more options
- Ask if there's anything about their profile they want to update (more detail = better matching)
- If they're unverified, suggest verification to get prioritized
- Never make up fake numbers or timelines

PLATFORM SIZE — NEVER REVEAL EXACT NUMBERS:
- NEVER say things like "we have 4 creators" or "only 1 business" or any specific count.
- NEVER hint that the platform is small or early.
- If asked how big Stroby is, say something like "We're growing fast" or "The network is expanding daily" without numbers.
- If there are no matches in their niche, frame it as "No relevant brands in [niche] yet — I'm actively scouting" — NEVER say "no brands" or "don't have any brands" (we have thousands of brands, just none that match this specific niche yet). Don't explain why (i.e. don't say "because we only have X users").
- Platform stats in the context below are for YOUR awareness only. Do NOT share them with the user verbatim.

OFF-TOPIC HANDLING:
- If someone asks about anything unrelated (general chat, advice, news, coding, personal questions, etc.), respond ONLY with: "I'm focused on helping you find great brand partnerships! Is there anything about your matches or profile I can help with?"
- Then include [FLAG_OFFTOPIC] at the end so the system logs it for review.

HONESTY — NEVER BREAK:
- NEVER fabricate info. No made-up companies, brands, metrics, or timelines.
- Only reference data from the user context below.
- If no matches exist, say "No relevant matches yet — I'll message you when I find one." NEVER say "no brands" — always say "no relevant brands/matches" to imply the platform has inventory.

PROPRIETARY DATA PROTECTION:
- NEVER reveal other users' data unless both sides have accepted a match (double opt-in).
- Even after opt-in, only share: company/newsletter name, contact first name, the offer details, niche, and match reasoning. Nothing else.
- NEVER reveal our tech stack, database, AI model, hosting, or architecture. If asked, say "We communicate through the WhatsApp Business API" and nothing more.
- NEVER mention Supabase, Vercel, Anthropic, Claude, Next.js, or any internal tools.

FORMATTING:
- Use WhatsApp formatting: *bold*, _italic_. Do NOT use markdown **double asterisks** or any other format.
- Keep responses under 80 words. Be friendly but brief.
- No bullet lists unless showing match details. Prefer short paragraphs.

STROBY PAY:
- Stroby Pay is our escrow payment system, powered and secured by Stripe Connect. The FIRST time you mention it in any conversation, always say "Stroby Pay, powered and secured by Stripe Connect." After that first mention, just say "Stroby Pay."
- Stroby Pay is COMPLETELY UNRELATED to matching. Users do NOT need Stroby Pay to get matches. NEVER say or imply otherwise.
- NEVER mention Stroby Pay or payment setup unless the user specifically asks about payments.
- If the user asks about payments/getting paid, say "I'll send you a Stroby Pay setup link now! Stroby Pay is powered and secured by Stripe Connect." and add [SEND_STRIPE_LINK] at the end.
- Do NOT suggest setting up Stroby Pay proactively. Ever. Not even as a hint or "final step".
- Do NOT generate URLs.

PLATFORM:
- There is NO dashboard, web portal, or login. Everything is through this WhatsApp chat.
- Do not tell users to email anyone or visit any website.

YOU ARE THE SYSTEM — NO HUMAN TEAM:
- There is NO team behind Stroby. There are no humans who "reach out", "review", or "follow up". You — Stroby — do all of it directly through this chat.
- NEVER say "the team will reach out", "we'll get back to you", "someone will contact you", "our team will review", or anything implying humans operate the platform. You are the only point of contact.
- When asked "when will I get matches?" → answer truthfully: "I scan for new matches every day. The moment I find one that fits, I message you right here." (Adapt to language and tone.) Do NOT invent specific timelines like "within 24 hours" or "within a week".
- When asked "what happens next?" → explain what YOU will do next (matching, sending suggestions on WhatsApp), not what some team will do.

PROFILE UPDATES — USE TOOLS, NOT WORDS:
- When the user wants to change a profile field, CALL THE APPROPRIATE TOOL. Don't just say "okay, I'll update that" without calling the tool — that produces hallucinated success and the field never actually changes (real failure mode from 2026-04-29 user trace).
- Tools available:
  - update_profile_field — for slug, name, niche, description, or price_per_placement (newsletter only). Pass the new value; the tool validates and writes to DB.
  - request_avatar_upload — for profile picture changes. The tool sets a pending state and the user's next photo gets stored as their avatar.
- If the user is vague ("change my profile pic" with no photo yet), call request_avatar_upload — the tool's reply asks for the photo.
- If the user gives a value but you're unsure which field they mean, ASK before calling the tool ("Do you mean your slug or your display name?"). Don't guess.
- For numeric fields outside the tool list (subscriber_count, avg_open_rate, avg_ctr): legacy [PROFILE_UPDATE]{json} marker still works — example: [PROFILE_UPDATE]{"subscriber_count": 50000}.

Only reference information from the user context and conversation summary below.`;

interface AgentResponse {
  response: string;
  action?: { type: string; data: Record<string, unknown> };
}

// ── Profile-update tools (Anthropic tool use) ──────────────────────────
// Replaces the dead-end "AI says 'sure I'll update'" pattern with actual
// validated DB writes. Tools return the user-facing reply text, so we
// don't need a second model call to compose the confirmation.

const PROFILE_UPDATE_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "update_profile_field",
    description: "Update a single profile field for the current user. Use when the user clearly wants to change one of: slug (their public profile URL), name (newsletter or company name), niche, description, or price_per_placement. The tool validates the value, writes to the DB, and returns a confirmation message ready to send back to the user.",
    input_schema: {
      type: "object",
      properties: {
        field: {
          type: "string",
          enum: ["slug", "name", "niche", "description", "price_per_placement"],
          description: "Which field to update.",
        },
        value: {
          type: "string",
          description: "The new value. For price_per_placement, pass dollars as a string (e.g. '500' or '$500/placement' — the tool parses it). For slug, lowercase letters/digits/hyphens only.",
        },
      },
      required: ["field", "value"],
    },
  },
  {
    name: "request_avatar_upload",
    description: "Ask the user to send a photo for their profile picture. Use when the user says they want to change/update their profile pic, avatar, or photo. The tool sets a pending state so the next inbound image becomes their avatar; reply text asks them to send the photo.",
    input_schema: { type: "object", properties: {} },
  },
];

async function executeProfileUpdateTool(
  toolName: string,
  input: Record<string, unknown>,
  userType: ProfileUserType,
  userId: string,
): Promise<string> {
  if (toolName === "update_profile_field") {
    const field = String(input.field || "");
    const value = String(input.value || "");
    if (!value) return "What value should I set?";

    switch (field) {
      case "slug":
        return (await updateSlug(userType, userId, value)).message;
      case "name":
        return (await updateName(userType, userId, value)).message;
      case "niche":
        return (await updateNiche(userType, userId, value)).message;
      case "description":
        return (await updateDescription(userType, userId, value)).message;
      case "price_per_placement":
        return (await updatePrice(userType, userId, value)).message;
      default:
        return `I can't update "${field}" yet — let me know what you want to change?`;
    }
  }

  if (toolName === "request_avatar_upload") {
    await setPendingIntent(userType, userId, "avatar_upload");
    return "Send me the photo and I'll set it as your profile picture.";
  }

  return "Got it — but I don't know how to do that yet.";
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

  // Fetch last 10 messages + conversation summary for context. The 5-message
  // window left the bot in goldfish mode — when a user said "I already told
  // you," the model literally couldn't see the prior turn. 10 covers a typical
  // back-and-forth without bloating the prompt.
  const recentMessages = await readDecryptedMessages(userId, 10);

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
Verified: ${profile.verification_status === "api_verified" ? "Yes (API)" : profile.verification_status === "screenshot" ? "Yes (screenshot)" : "Not yet"}
Onboarding status: ${profile.onboarding_status || "Unknown"}`
      : `User type: Business
Company: ${profile.company_name || "Unknown"}
Product: ${profile.product_description || "Not set"}
Target customer: ${profile.target_customer || "Not set"}
Campaign goal: ${profile.campaign_goal || "Not set"}
Budget range: ${profile.budget_range || "Not set"}
Niche: ${profile.primary_niche || "Not set"}
Onboarding status: ${profile.onboarding_status || "Unknown"}`;

  // Conversation summary (long-term memory)
  const summaryContext = profile.conversation_summary
    ? `\nConversation history summary: ${profile.conversation_summary}`
    : "";

  // Self-learning insights (match history, patterns, preferences)
  const insightsContext = formatInsightsForAI(profile.preferences as Record<string, unknown> | null);

  // Profile completeness
  const { score: completenessScore, missing: missingFields } = calculateCompleteness(profile, userType);
  const completenessContext = formatCompletenessForAI(completenessScore, missingFields);

  // Platform niche availability — boolean only, no counts (to avoid revealing early-stage size)
  const userNiche = profile.primary_niche || profile.niche || null;
  let platformContext = "";
  try {
    if (userNiche) {
      const nicheTable = userType === "newsletter" ? "business_profiles" : "newsletter_profiles";
      const { count } = await supabase
        .from(nicheTable)
        .select("id", { count: "exact", head: true })
        .eq("primary_niche", userNiche)
        .eq("is_active", true);

      if ((count || 0) > 0) {
        platformContext = `\nNiche availability: Matches available in ${userNiche}`;
      } else {
        platformContext = `\nNiche availability: No direct matches in ${userNiche} yet — suggest related niches`;
      }
    }
  } catch { /* non-critical */ }

  // Legacy preferences (kept for backwards compat)
  const prefsContext = profile.preferences && Object.keys(profile.preferences).length > 0
    ? "" // Now handled by insightsContext above
    : "";

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
      // Trim each historical message to save tokens
      const content = ((msg.content as string) || "").slice(0, 300);
      messages.push({
        role: msg.direction === "inbound" ? "user" : "assistant",
        content,
      });
    }
  }

  // Add the current message
  const currentContent = mediaUrl
    ? `${messageBody || ""}\n[Media attached: ${mediaUrl}]`
    : messageBody || "";
  messages.push({ role: "user", content: currentContent });

  // Call Claude with profile-update tools. The model decides whether the
  // user is asking to update something concrete (slug, description, niche,
  // price, name, profile pic) and emits a structured tool call. Otherwise
  // it replies with text. Single round-trip — we don't loop back for a
  // text follow-up; the tool's UpdateResult.message IS the reply, so
  // "Done. Your profile is now at …" lands in one Haiku call.
  //
  // 256 → 800 max_tokens because 256 was forcing mid-sentence truncation,
  // making the bot sound robotic and abrupt. 800 is still cheap and gives
  // Haiku room to think.
  const anthropic = getAnthropic();
  const completion = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    system: `${SYSTEM_PROMPT}\n\n--- User Context ---\n${userContext}${completenessContext}${insightsContext}${platformContext}${summaryContext}${introContext}`,
    messages,
    tools: PROFILE_UPDATE_TOOLS,
  });

  logApiUsage({
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    route: "ai-agent",
    tokensIn: completion.usage?.input_tokens || 0,
    tokensOut: completion.usage?.output_tokens || 0,
  });

  // Tool-use path: execute the requested update and return its message.
  // We don't make a second model call to "soften" the confirmation —
  // the helpers in profile-update.ts return user-facing text already.
  const toolBlock = completion.content.find((b) => b.type === "tool_use");
  if (toolBlock && toolBlock.type === "tool_use") {
    const toolMsg = await executeProfileUpdateTool(
      toolBlock.name,
      toolBlock.input as Record<string, unknown>,
      userType,
      userId,
    );
    return { response: toolMsg };
  }

  const textBlock = completion.content.find((b) => b.type === "text");
  const responseText = textBlock && textBlock.type === "text" ? textBlock.text : "";
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

  // Intent detection and action handling is now done pre-AI in the webhook.
  // This function just handles logging and periodic summarization.

  // Log the outbound message (encrypted)
  await insertMessage({
    direction: "outbound",
    user_type: userType,
    user_id: userId,
    phone,
    content: response,
  });

  // Conversation summarization: every 10 messages, compress history
  try {
    const { count } = await supabase
      .from("agent_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    if (count && count % 10 === 0 && count > 0) {
      const allMessages = await readDecryptedMessages(userId, 10);
      if (allMessages.length >= 8) {
        const transcript = allMessages
          .map((m) => `${m.direction === "inbound" ? "User" : "Stroby"}: ${m.content.slice(0, 200)}`)
          .join("\n");

        const anthropic = getAnthropic();
        const summaryResult = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 150,
          messages: [{
            role: "user",
            content: `Summarize this conversation in 2-3 sentences. Focus on: what the user wants, any preferences mentioned, and current status.\n\n${transcript}`,
          }],
        });

        logApiUsage({
          provider: "anthropic",
          model: "claude-haiku-4-5-20251001",
          route: "summarization",
          tokensIn: summaryResult.usage?.input_tokens || 0,
          tokensOut: summaryResult.usage?.output_tokens || 0,
        });

        const summary = summaryResult.content[0].type === "text" ? summaryResult.content[0].text : "";
        if (summary) {
          const table = userType === "newsletter" ? "newsletter_profiles" : "business_profiles";
          await supabase.from(table).update({ conversation_summary: summary }).eq("id", userId);
        }
      }
    }
  } catch {
    // Non-critical — don't break the response flow
  }

  return response;
}
