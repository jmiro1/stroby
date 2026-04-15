import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "./supabase";
import { readOnboardingMessages } from "./secure-messages";
import { logApiUsage } from "./api-usage";

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return _anthropic;
}

const ONBOARDING_PROMPT = `You are Stroby — Stroby.ai, a free WhatsApp-based superconnector AI that connects brands with newsletter creators and influencers for sponsorship partnerships. A new user is messaging you on WhatsApp for the first time. Their phone number is already known. When you describe Stroby in a single sentence, always frame it as "Stroby.ai, a free WhatsApp-based superconnector AI" — paraphrase naturally, never recite.

PERSONALITY: Mad Men creative director at a dinner party with friends — intelligent, quietly funny, genuinely warm, self-respecting. Measured but not cold. Friendly but not fawning. Short to medium sentences with natural rhythm. Dry wit when it lands, never forced. No "Great question!" or "Happy to help!". Match the user's energy. Little verbal signals like "Nice.", "Got it.", "Right.", "Love that.", "Makes sense." when they fit.

LANGUAGE: Detect the language the user writes in and respond in that same language. Default to English.

YOUR JOB: Onboard them through a short, friendly conversation. Collect the info below, then output a profile.

FIRST MESSAGE FLOW:
1. Welcome them warmly. Ask: "Are you new to Stroby, or did you already sign up on stroby.ai with a different phone number?"
2. If they signed up before: ask for the email or phone they used. Output [LINK_ACCOUNT] followed by JSON: {"email":"...","phone":"..."} (whichever they give). Then stop — the system will handle the linking.
3. If they're new: ask "Are you a business looking for partners, or an influencer/creator looking for brand deals?"

FOR INFLUENCERS/CREATORS — collect these fields:
  user_type, referral_source, name, platform, channel_name, url, niche, audience_size, price_per_placement, email

FOR BUSINESSES — collect these fields:
  user_type, referral_source, contact_name, contact_role, company_name, website_url, product_description, target_customer, buyer_description, past_newsletter_sponsors, niche, budget_range, partner_preference, email

EMAIL (BOTH SIDES): When asking for email, frame it as: "What's the best email to reach you at — just in case WhatsApp ever goes down?" This makes the ask feel protective, not extractive. The email is their preferred contact backup.

IMPORTANT extra questions for businesses (weave in naturally):
- "website_url": Ask for their website URL early — "What's your website? I'll take a look."
- "buyer_description": Ask "In one sentence, describe the kind of person who buys your product — not job title, but who they are." This is the most important field. The answer should be psychographic: "ambitious operators scaling their first startup" not "marketing managers".
- "past_newsletter_sponsors": Ask "Have you done newsletter sponsorships before? Which ones worked?" — even "no" is useful info.

RULES:
- Ask 2-3 things per message max. Be conversational, not a form.
- Keep each response under 60 words.
- Use WhatsApp formatting: *bold* (single asterisks only).
- Their WhatsApp number is already captured — don't ask for phone.
- Do NOT invent or assume data. Only use what they explicitly told you.
- "I don't know" / "not sure" / "don't remember" is a valid answer — accept it (store as null), move on. NEVER loop on the same question.
- NEVER say "one more thing", "last thing", "final question", "one last question", "almost done", or anything implying you're at the end — UNLESS literally every other required field in [STATE] is already non-null and this is genuinely the very last one. Lying about being almost done destroys trust instantly. If you have 5 fields left, just ask the next one without preamble.

OUTPUT FORMAT — CRITICAL:
Every single response MUST start with a JSON state line on its own first line, then a blank line, then your natural reply. Format:

[STATE] {"user_type":"influencer","referral_source":"a friend","name":"Sam","platform":null,"channel_name":null,"url":null,"niche":null,"audience_size":null,"price_per_placement":null,"email":null}

Hey Sam! What platform do you publish on...

Rules for [STATE]:
- Include EVERY field for the user's type (use null for unknown).
- Update it on every turn — copy forward what you already knew, add what's new.
- The system strips this line before sending to the user.
- Use the [STATE] as your single source of truth: only ask for fields whose value is null. NEVER ask about a field whose value is non-null. Ever.

PROFILE COMPLETION:
- The moment every required field in [STATE] is non-null, output [PROFILE_COMPLETE] followed by the same JSON on the next line, then a friendly wrap-up (3-5 short sentences, WhatsApp-style).
- Do NOT do a "let me confirm everything before we wrap up" pass. The [STATE] is the truth — if it's full, you're done. No re-asking, no double-checking.
- Do NOT mention verification links, verification badges, or "verify your metrics" in your wrap-up. The system handles verification separately.

WRAP-UP CONTENT (for CREATORS/INFLUENCERS — skip for businesses, use a simpler wrap-up):
Your wrap-up message must cover these three things, in your own words, in this order:
1. Confirm they're in and you'll start finding matches.
2. Tell them they have a live profile page they can view and polish at *stroby.ai/welcome/[id]* — the system substitutes the real ID when it sends a follow-up welcome message with a clickable link, so DON'T make up a URL yourself. Just tell them a profile page exists, that they'll get a link in the next message, and that fuller profiles = better matches.
3. Ask them to invite 1-2 fellow newsletter creators they trust. Frame it honestly: the faster Stroby grows, the better the matches they'll get. Tell them they can share Stroby's WhatsApp link — *wa.me/message/2QFL7QR7EBZTD1* — with any creator friend.

For BUSINESSES, skip step 3 (no peer-invite ask) and keep step 2 light — just say their profile is live and a link will come in the next message. Keep the whole wrap-up friendly and short.`;

export interface OnboardingResult {
  response: string;
  profileComplete?: boolean;
  profileData?: Record<string, unknown>;
  linkAccount?: boolean;
  linkData?: { email?: string; phone?: string };
}

export async function handleOnboardingMessage(
  phone: string,
  messageBody: string
): Promise<OnboardingResult> {
  // Fetch conversation history (decrypted). The webhook logs the current
  // inbound message *before* this runs, so it's already in `recentMessages`
  // — we must NOT append it again or the model sees it twice.
  const recentMessages = await readOnboardingMessages(phone, 20);

  // Build messages array. Collapse same-role consecutive entries because
  // the Anthropic API requires alternating roles.
  const messages: Anthropic.MessageParam[] = [];

  if (recentMessages && recentMessages.length > 0) {
    for (const msg of recentMessages) {
      const role = msg.direction === "inbound" ? "user" : "assistant";
      const content = ((msg.content as string) || "").slice(0, 400);
      const last = messages[messages.length - 1];
      if (last && last.role === role) {
        last.content = (last.content as string) + "\n" + content;
      } else {
        messages.push({ role, content });
      }
    }
  }

  // The Anthropic API requires the first message to be from `user`. If the
  // history starts with an assistant turn, drop leading assistants.
  while (messages.length > 0 && messages[0].role !== "user") {
    messages.shift();
  }

  // Ensure the conversation ends with the current user turn. If the last
  // logged message isn't already this user message (e.g. log lag, or
  // inbound logging failed for any reason), append it. Anthropic also
  // rejects an empty messages array, so this is the safety floor.
  const trimmedBody = messageBody.slice(0, 500);
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user" || (last.content as string).slice(-trimmedBody.length) !== trimmedBody) {
    if (last && last.role === "user") {
      last.content = (last.content as string) + "\n" + trimmedBody;
    } else {
      messages.push({ role: "user", content: trimmedBody });
    }
  }

  const anthropic = getAnthropic();
  const completion = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    system: ONBOARDING_PROMPT,
    messages,
  });

  logApiUsage({
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    route: "onboarding",
    tokensIn: completion.usage?.input_tokens || 0,
    tokensOut: completion.usage?.output_tokens || 0,
  });

  const rawResponseText =
    completion.content[0].type === "text" ? completion.content[0].text : "";

  // Extract and strip the [STATE] line — it's for the model's own bookkeeping,
  // not for the user.
  let stateData: Record<string, unknown> | null = null;
  const stateMatch = rawResponseText.match(/\[STATE\]\s*(\{[\s\S]*?\})/);
  if (stateMatch) {
    try {
      stateData = JSON.parse(stateMatch[1]);
    } catch { /* ignore */ }
  }
  const responseText = rawResponseText.replace(/\[STATE\]\s*\{[\s\S]*?\}\s*/g, "").trim();

  // Check for [LINK_ACCOUNT]
  if (responseText.includes("[LINK_ACCOUNT]")) {
    const jsonMatch = responseText.match(/\[LINK_ACCOUNT\]\s*(\{[\s\S]*?\})/);
    let linkData: { email?: string; phone?: string } = {};
    if (jsonMatch) {
      try {
        linkData = JSON.parse(jsonMatch[1]);
      } catch { /* ignore parse error */ }
    }

    const cleanResponse = responseText
      .replace(/\[LINK_ACCOUNT\]\s*\{[\s\S]*?\}/, "")
      .trim();

    return {
      response: cleanResponse || "Let me look that up for you!",
      linkAccount: true,
      linkData,
    };
  }

  // Check for [PROFILE_COMPLETE]
  if (responseText.includes("[PROFILE_COMPLETE]")) {
    const jsonMatch = responseText.match(/\[PROFILE_COMPLETE\]\s*(\{[\s\S]*?\})/);
    let profileData: Record<string, unknown> | undefined;
    if (jsonMatch) {
      try {
        profileData = JSON.parse(jsonMatch[1]);
      } catch { /* ignore parse error */ }
    }

    const cleanResponse = responseText
      .replace(/\[PROFILE_COMPLETE\]\s*\{[\s\S]*?\}/, "")
      .trim();

    return {
      response: cleanResponse || "You're all set! I'll start finding matches for you.",
      profileComplete: true,
      profileData,
    };
  }

  // Safety net: if the model populated every required field in [STATE] but
  // forgot to emit [PROFILE_COMPLETE], finish onboarding anyway. Prevents
  // the "let me confirm everything" loop the model loves to slide into.
  if (stateData && isStateComplete(stateData)) {
    return {
      response: responseText || "Perfect — you're all set! I'll start looking for matches.",
      profileComplete: true,
      profileData: stateData,
    };
  }

  return { response: responseText };
}

const REQUIRED_FIELDS: Record<"influencer" | "business", string[]> = {
  influencer: ["user_type", "name", "platform", "channel_name", "niche", "audience_size", "email"],
  business: ["user_type", "contact_name", "company_name", "product_description", "target_customer", "niche", "budget_range", "email", "website_url"],
};

function isStateComplete(state: Record<string, unknown>): boolean {
  const ut = state.user_type as string | undefined;
  if (ut !== "influencer" && ut !== "business") return false;
  return REQUIRED_FIELDS[ut].every((k) => state[k] != null && state[k] !== "");
}

// Create profile from onboarding data
export async function createProfileFromOnboarding(
  phone: string,
  data: Record<string, unknown>
): Promise<{ id: string; userType: "newsletter" | "business" | "other" } | null> {
  const supabase = createServiceClient();
  const userType = (data.user_type as string) || "influencer";

  if (userType === "business") {
    const { data: profile, error } = await supabase
      .from("business_profiles")
      .insert({
        company_name: data.company_name || "Unknown",
        contact_name: data.contact_name || data.name || "Contact",
        contact_role: data.contact_role || data.role || null,
        product_description: data.product_description || data.what_they_sell || null,
        target_customer: data.target_customer || null,
        primary_niche: data.niche || data.primary_niche || "Other",
        description: data.website_url
          ? `Website: ${data.website_url}${data.description ? ` | ${data.description}` : ""}`
          : data.description || null,
        budget_range: data.budget_range || null,
        campaign_goal: data.campaign_goal || null,
        partner_preference: data.partner_preference || "all",
        email: data.email || null,
        phone,
        referral_source: data.referral_source || data.referral || null,
        onboarding_status: "whatsapp_active",
      })
      .select("id")
      .single();

    if (error || !profile) {
      // Loud failure — the webhook should propagate this so we never
      // get a "you're all set" message followed by no profile.
      console.error("Failed to create business profile from WhatsApp:", error);
      throw new Error(`business_profile insert failed: ${error?.message || "unknown"}`);
    }
    return { id: profile.id, userType: "business" };
  }

  // Influencer / newsletter / creator
  const priceCents = data.price_per_placement
    ? Math.round(parseFloat(String(data.price_per_placement).replace(/[$,]/g, "")) * 100)
    : null;

  const rawName = (data.channel_name || data.name || "creator") as string;
  const slug = rawName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Math.random().toString(36).slice(2, 6);

  const { data: profile, error } = await supabase
    .from("newsletter_profiles")
    .insert({
      newsletter_name: data.channel_name || data.name || "Unknown",
      slug,
      owner_name: data.owner_name || data.name || "Creator",
      url: data.url || null,
      platform: data.platform || null,
      primary_niche: data.niche || data.primary_niche || "Other",
      description: data.description || null,
      subscriber_count: data.audience_size
        ? parseInt(String(data.audience_size).replace(/[,\s]/g, ""), 10)
        : null,
      price_per_placement: isNaN(priceCents as number) ? null : priceCents,
      email: data.email || null,
      phone,
      referral_source: data.referral_source || data.referral || null,
      onboarding_status: "whatsapp_active",
    })
    .select("id")
    .single();

  if (error || !profile) {
    console.error("Failed to create influencer profile from WhatsApp:", error);
    throw new Error(`newsletter_profile insert failed: ${error?.message || "unknown"}`);
  }
  return { id: profile.id, userType: "newsletter" };
}

// Link an existing account to a new phone number
export async function linkExistingAccount(
  newPhone: string,
  linkData: { email?: string; phone?: string }
): Promise<{ found: boolean; name?: string; userType?: string }> {
  const supabase = createServiceClient();

  const tables = [
    { name: "newsletter_profiles", type: "newsletter", nameField: "newsletter_name" },
    { name: "business_profiles", type: "business", nameField: "company_name" },
    { name: "other_profiles", type: "other", nameField: "name" },
  ] as const;

  for (const table of tables) {
    let query = supabase.from(table.name).select("*");

    if (linkData.email) {
      // Validate email format to prevent PostgREST filter injection
      const email = linkData.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
        return { found: false };
      }
      query = query.eq("email", email);
    } else if (linkData.phone) {
      // Strip to digits only to prevent PostgREST filter injection
      const cleanPhone = linkData.phone.replace(/\D/g, "");
      if (!cleanPhone || cleanPhone.length < 7 || cleanPhone.length > 15) {
        return { found: false };
      }
      query = query.or(`phone.eq.${cleanPhone},phone.eq.+${cleanPhone}`);
    } else {
      continue;
    }

    const { data } = await query.maybeSingle();
    if (data) {
      const record = data as Record<string, unknown>;
      // SECURITY: Do NOT auto-update the phone number.
      // Account linking requires email verification (handled by the caller).
      // We only return that the account was found — the phone update happens
      // after the user confirms ownership via email.
      const displayName = (record[table.nameField] as string) || "your account";
      return { found: true, name: displayName, userType: table.type };
    }
  }

  return { found: false };
}
