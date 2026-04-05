import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "./supabase";
import { readOnboardingMessages } from "./secure-messages";

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return _anthropic;
}

const ONBOARDING_PROMPT = `You are Stroby, an AI superconnector for brand partnerships. A new user is messaging you on WhatsApp for the first time. Their phone number is already known.

LANGUAGE: Detect the language the user writes in and respond in that same language. Default to English.

YOUR JOB: Onboard them through a short, friendly conversation. Collect the info below, then output a profile.

FIRST MESSAGE FLOW:
1. Welcome them warmly. Ask: "Are you new to Stroby, or did you already sign up on stroby.ai with a different phone number?"
2. If they signed up before: ask for the email or phone they used. Output [LINK_ACCOUNT] followed by JSON: {"email":"...","phone":"..."} (whichever they give). Then stop — the system will handle the linking.
3. If they're new: ask "Are you a business looking for partners, or an influencer/creator looking for brand deals?"

FOR INFLUENCERS/CREATORS — collect:
- How they heard about Stroby (referral)
- Their name
- Platform (Newsletter, YouTube, Instagram, TikTok, Podcast, Blog, LinkedIn, X, Other)
- Channel/account name and URL
- Niche
- Audience size
- What they typically charge per partnership (or "not sure")
- Email address

FOR BUSINESSES — collect:
- How they heard about Stroby (referral)
- Contact name and role
- Company name
- What they sell (1 sentence)
- Target customer
- Niche
- Monthly budget range (<$500, $500-$1k, $1k-$2.5k, $2.5k-$5k, $5k+)
- Partner preference (newsletters only, influencers only, or all)
- Email address

RULES:
- Ask 2-3 things per message max. Be conversational, not a form.
- Keep each response under 60 words.
- Use WhatsApp formatting: *bold* (single asterisks only).
- Their WhatsApp number is already captured — don't ask for phone.
- When you have ALL required fields, output [PROFILE_COMPLETE] followed by a JSON block on the next line with the extracted data and a "user_type" field ("influencer" or "business").
- After the JSON, add a short friendly confirmation (1 sentence).
- Do NOT invent or assume data. Only use what they explicitly told you.`;

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
  // Fetch conversation history (decrypted)
  const recentMessages = await readOnboardingMessages(phone, 10);

  // Build messages array
  const messages: Anthropic.MessageParam[] = [];

  if (recentMessages && recentMessages.length > 0) {
    for (const msg of recentMessages) {
      const content = ((msg.content as string) || "").slice(0, 300);
      messages.push({
        role: msg.direction === "inbound" ? "user" : "assistant",
        content,
      });
    }
  }

  // Add current message
  messages.push({ role: "user", content: messageBody.slice(0, 500) });

  const anthropic = getAnthropic();
  const completion = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system: ONBOARDING_PROMPT,
    messages,
  });

  const responseText =
    completion.content[0].type === "text" ? completion.content[0].text : "";

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

  return { response: responseText };
}

// Create profile from onboarding data
export async function createProfileFromOnboarding(
  phone: string,
  data: Record<string, unknown>
): Promise<{ id: string; userType: string } | null> {
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
        description: data.description || null,
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
      console.error("Failed to create business profile from WhatsApp:", error);
      return null;
    }
    return { id: profile.id, userType: "business" };
  }

  // Influencer / newsletter / creator
  const priceCents = data.price_per_placement
    ? Math.round(parseFloat(String(data.price_per_placement).replace(/[$,]/g, "")) * 100)
    : null;

  const { data: profile, error } = await supabase
    .from("newsletter_profiles")
    .insert({
      newsletter_name: data.channel_name || data.name || "Unknown",
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
    return null;
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
      query = query.eq("email", linkData.email);
    } else if (linkData.phone) {
      const cleanPhone = linkData.phone.replace(/[\s\-()]/g, "");
      query = query.or(`phone.eq.${cleanPhone},phone.eq.+${cleanPhone}`);
    } else {
      continue;
    }

    const { data } = await query.maybeSingle();
    if (data) {
      const record = data as Record<string, unknown>;
      // Update the phone number to the new WhatsApp number
      await supabase
        .from(table.name)
        .update({ phone: newPhone })
        .eq("id", record.id);

      const displayName = (record[table.nameField] as string) || "your account";
      return { found: true, name: displayName, userType: table.type };
    }
  }

  return { found: false };
}
