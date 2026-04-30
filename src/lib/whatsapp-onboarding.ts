import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "./supabase";
import { readOnboardingMessages } from "./secure-messages";
import { logApiUsage } from "./api-usage";
import {
  getOnboardingState,
  setOnboardingField,
  isOnboardingComplete,
  formatStateForPrompt,
  ONBOARDING_FIELD_NAMES,
  type OnboardingState,
} from "./onboarding-state";

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return _anthropic;
}

// Tools the onboarding model can call. `record_field` is the workhorse —
// every learned value is stored via this. `link_existing_account` and
// `complete_onboarding` are control-flow signals back to the webhook.
const ONBOARDING_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "record_field",
    description:
      "Record a single profile field the user just gave you. Call this every time you learn something new — even minor things. The system stores it durably so the next turn already has it. Don't track state in your reply text — just call this and write a natural reply.",
    input_schema: {
      type: "object",
      properties: {
        field: {
          type: "string",
          enum: [...ONBOARDING_FIELD_NAMES],
          description: "Field name. Use exactly one of the allowed values.",
        },
        value: {
          type: "string",
          description:
            "The value the user gave. Numbers as strings (e.g. \"50000\"). Pass null/empty if the user said they don't know — the system records that as 'no data' and won't re-ask.",
        },
      },
      required: ["field", "value"],
    },
  },
  {
    name: "link_existing_account",
    description:
      "User said they signed up before with a different phone or via email. Pass whichever identifier they gave you. The system looks them up and merges the WhatsApp number into the existing profile.",
    input_schema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Email used previously, if given." },
        phone: { type: "string", description: "Phone used previously, if given." },
      },
    },
  },
  {
    name: "complete_onboarding",
    description:
      "All required fields are collected and the user has confirmed they're ready. Call this exactly once to finalize the profile. After this call, the system creates their profile and sends a welcome with their public profile link.",
    input_schema: { type: "object", properties: {} },
  },
];

const ONBOARDING_PROMPT = `You are Stroby — Stroby.ai, a free WhatsApp-based superconnector AI that connects brands with newsletter creators and influencers for sponsorship partnerships. A new user is messaging you on WhatsApp for the first time. Their phone number is already known. When you describe Stroby in a single sentence, always frame it as "Stroby.ai, a free WhatsApp-based superconnector AI" — paraphrase naturally, never recite.

PERSONALITY: Mad Men creative director at a dinner party with friends — intelligent, quietly funny, genuinely warm, self-respecting. Measured but not cold. Friendly but not fawning. Short to medium sentences with natural rhythm. Dry wit when it lands, never forced. No "Great question!" or "Happy to help!". Match the user's energy. Little verbal signals like "Nice.", "Got it.", "Right.", "Love that.", "Makes sense." when they fit.

LANGUAGE: Detect the language the user writes in and respond in that same language. Default to English.

YOUR JOB: Onboard them through a short, friendly conversation. Collect the info below, then output a profile.

FIRST MESSAGE FLOW:
1. Welcome them warmly. Ask: "Are you new to Stroby, or did you already sign up on stroby.ai with a different phone number?"
2. If they signed up before: ask for the email or phone they used, then call the link_existing_account tool with whichever identifier they give. Write a brief "let me look that up" reply. The system handles the merge.
3. If they're new: ask "Are you a business looking for partners, or an influencer/creator looking for brand deals?"

FOR INFLUENCERS/CREATORS — collect these fields:
  user_type, referral_source, name, platform, channel_name, url, niche, audience_size, engagement_rate, price_per_placement, email

PLATFORM OPTIONS (ask early: "What platform do you publish on?"):
  newsletter (beehiiv/substack/convertkit/mailchimp), youtube, instagram, tiktok, podcast, linkedin, twitter, blog, other

PLATFORM-ADAPTIVE BEHAVIOR (CRITICAL — once you know their platform, adapt everything):

Once the user tells you their platform, SWITCH your vocabulary for the rest of the conversation:
  Newsletter: say "subscribers", "open rate", "newsletter", "issues"
  YouTube: say "subscribers", "views", "videos", "channel"
  Instagram: say "followers", "likes", "posts" or "reels"
  TikTok: say "followers", "views", "videos"
  Podcast: say "listeners", "downloads", "episodes", "show"
  LinkedIn/Twitter: say "followers", "impressions", "posts"

Ask channel_name using the right word:
  Newsletter: "What's your newsletter called?"
  YouTube: "What's your channel name?"
  Instagram/TikTok: "What's your handle?"
  Podcast: "What's your show called?"
  LinkedIn/Twitter/Blog: "What name do you go by on [platform]?"

Ask url using the right framing:
  Newsletter: "Got a link to your newsletter?"
  YouTube: "Drop your channel link?"
  Instagram/TikTok: "What's your profile link?"
  Podcast: "Where can I listen — Apple, Spotify?"
  LinkedIn/Twitter: "Profile URL?"

PLATFORM-SPECIFIC METRICS (ask 1-2 natural questions, NOT a quiz):
  Newsletter: "What's your typical open rate?" → engagement_rate. Also CTR if they know it.
  YouTube: "Average views per video?" → store audience_size as subscribers, engagement_rate if they know likes/views ratio.
  Instagram: "How many followers? Average likes per post?" → audience_size = followers, engagement_rate = avg_likes/followers.
  TikTok: "Average views per video?" → audience_size = followers, engagement_rate if known.
  Podcast: "How many downloads per episode?" → audience_size = avg downloads.
  LinkedIn/Twitter: "How many followers? Average impressions?" → audience_size = followers.
  Blog/Other: just ask audience_size.

If they don't know their engagement rate, store null and move on. The key number is audience_size (their reach).

FOR BUSINESSES — collect these fields:
  user_type, referral_source, contact_name, contact_role, company_name, website_url, product_description, target_customer, buyer_description, past_newsletter_sponsors, niche, budget_range, campaign_outcome, preferred_creator_type, preferred_creator_size, email

EMAIL (BOTH SIDES): When asking for email, frame it as: "What's the best email to reach you at — just in case WhatsApp ever goes down?" This makes the ask feel protective, not extractive. The email is their preferred contact backup.

IMPORTANT extra questions for businesses (weave in naturally):
- "website_url": Ask for their website URL early — "What's your website? I'll take a look."
- "buyer_description": Ask "In one sentence, describe the kind of person who buys your product — not job title, but who they are." This is the most important field. The answer should be psychographic: "ambitious operators scaling their first startup" not "marketing managers".
- "past_newsletter_sponsors": Ask "Have you done newsletter sponsorships before? Which ones worked?" — even "no" is useful info.
- "campaign_outcome": After budget, ask: "What matters most to you from a creator partnership — maximum *reach* (eyeballs), audience *engagement* (comments, shares), *conversions* (clicks, signups), or *credibility* (association with a trusted voice)?" Store exactly one of: reach, engagement, conversions, credibility. This is REQUIRED — don't skip it.
- "preferred_creator_type": "Are you looking to sponsor newsletters, YouTube channels, podcasts, Instagram creators — or open to anything?" Store: newsletter, youtube, instagram, tiktok, podcast, linkedin, twitter, or any. Optional — default to "any" if they skip.
- "preferred_creator_size": "Prefer bigger names (100k+ audience), mid-tier (10-100k), micro-creators (under 10k), or no preference?" Store: micro, mid, macro, or any. Optional — default to "any" if they skip. Can combine with preferred_creator_type in one message.

RULES:
- Ask 2-3 things per message max. Be conversational, not a form.
- Keep each response under 60 words.
- Use WhatsApp formatting: *bold* (single asterisks only).
- Their WhatsApp number is already captured — don't ask for phone.
- Do NOT invent or assume data. Only use what they explicitly told you.
- "I don't know" / "not sure" / "don't remember" is a valid answer — accept it (store as null), move on. NEVER loop on the same question.
- NEVER say "one more thing", "last thing", "final question", "one last question", "almost done", or anything implying you're at the end — UNLESS the current state in the system prompt shows literally every other required field is already filled and this is genuinely the very last one. Lying about being almost done destroys trust instantly. If you have 5 fields left, just ask the next one without preamble.

STATE MANAGEMENT — VIA TOOLS, NOT TEXT:
- The system tracks state for you. After each user message, you'll see "Current state (already collected — DO NOT ask again):" with everything we've recorded so far. NEVER ask for a field that's already in that list.
- When the user gives you a value, immediately call the record_field tool with the field name and value. You can call it multiple times in a single turn (if they gave you 2 things at once, record both).
- When the user says they don't know / not sure / can't remember a field, call record_field with value="" — that records "no data" and the system won't re-ask. Move on to the next field.
- Don't put state in your reply text. Just call the tool and write a natural conversational reply.

RETURNING USERS:
- If the user says they signed up before with a different phone/email, call link_existing_account with whichever identifier they gave you, then write a brief "let me look that up" reply. The system handles the merge.

WHEN ONBOARDING IS DONE:
- The moment all required fields are recorded (the system shows you completion in the prompt), call complete_onboarding once and write the wrap-up message. Don't do a confirmation pass — if the state is full, you're done.
- Do NOT mention verification links or "verify your metrics" in the wrap-up. The system handles verification separately.

WRAP-UP CONTENT (for CREATORS/INFLUENCERS — skip for businesses, use a simpler wrap-up):
Your wrap-up message must cover these three things, in your own words, in this order:
1. Confirm they're in and you'll start finding matches.
2. Tell them they have a live profile page they can view and polish — the system sends a follow-up welcome message with a clickable link, so DON'T make up a URL yourself. Just tell them a profile page exists, that they'll get a link in the next message, and that fuller profiles = better matches.
3. Ask them to invite 1-2 fellow creators they trust (say "creators", not "newsletter creators" — they may be YouTubers, podcasters, etc.). Frame it honestly: the faster Stroby grows, the better the matches they'll get. Tell them they can share Stroby's WhatsApp link — *wa.me/message/2QFL7QR7EBZTD1* — with any creator friend.

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

  // ── Load durable state and inject it into the system prompt ──────────
  const currentState = await getOnboardingState(phone);
  const stateBlock = formatStateForPrompt(currentState);

  const anthropic = getAnthropic();
  // ONBOARDING_PROMPT is ~4K tokens of static persona + state-machine rules
  // — cached on first call, reused for every subsequent turn within the
  // ~5-minute window. The dynamic state block isn't cached (different
  // per turn) but it's tiny relative to the persona.
  const completion = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    system: [
      { type: "text", text: ONBOARDING_PROMPT, cache_control: { type: "ephemeral" } },
      { type: "text", text: stateBlock },
    ],
    messages,
    tools: ONBOARDING_TOOLS,
  });

  logApiUsage({
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    route: "onboarding",
    tokensIn: completion.usage?.input_tokens || 0,
    tokensOut: completion.usage?.output_tokens || 0,
  });

  // Pull text + tool calls out of the response. A single completion can
  // emit BOTH a text reply and one or more tool_use blocks.
  let responseText = "";
  let linkAccount: { email?: string; phone?: string } | null = null;
  let completeRequested = false;
  let nextState = currentState;

  for (const block of completion.content) {
    if (block.type === "text") {
      responseText += (responseText ? "\n" : "") + block.text;
    } else if (block.type === "tool_use") {
      if (block.name === "record_field") {
        const input = block.input as { field?: string; value?: string };
        if (input.field) {
          try {
            nextState = await setOnboardingField(phone, input.field as keyof OnboardingState, input.value ?? null);
          } catch (e) {
            console.error("onboarding record_field failed:", e);
          }
        }
      } else if (block.name === "link_existing_account") {
        const input = block.input as { email?: string; phone?: string };
        linkAccount = { email: input.email, phone: input.phone };
      } else if (block.name === "complete_onboarding") {
        completeRequested = true;
      }
    }
  }

  // Fallback text if the model emitted only tool calls (rare with
  // tool_choice:auto, but possible). Prevents the user seeing nothing back.
  if (!responseText) {
    responseText = "Got it — what about the next bit?";
  }

  if (linkAccount) {
    return {
      response: responseText,
      linkAccount: true,
      linkData: linkAccount,
    };
  }

  // Completion: either the model called complete_onboarding, OR every
  // required field is filled and the model forgot to call it (safety net,
  // matches the prior [PROFILE_COMPLETE]-forgotten-but-state-full path).
  if (completeRequested || isOnboardingComplete(nextState)) {
    return {
      response: responseText,
      profileComplete: true,
      profileData: nextState as Record<string, unknown>,
    };
  }

  return { response: responseText };
}

// Create profile from onboarding data
export async function createProfileFromOnboarding(
  phone: string,
  data: Record<string, unknown>
): Promise<{ id: string; userType: "newsletter" | "business" | "other" } | null> {
  const supabase = createServiceClient();
  const userType = (data.user_type as string) || "influencer";

  if (userType === "business") {
    // Shadow-claim path: if a scraped shadow row already exists for this
    // brand (matched by website), promote it in-place instead of inserting
    // a duplicate. website_url is carried in `description` as "Website: <url>".
    const websiteUrl = (data.website_url as string | undefined) || "";
    if (websiteUrl) {
      const { data: shadow } = await supabase
        .from("business_directory")
        .select("id, onboarding_status")
        .eq("onboarding_status", "shadow")
        .ilike("description", `%${websiteUrl.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`)
        .limit(1)
        .maybeSingle();
      if (shadow?.id) {
        const { data: promoted, error: promoteErr } = await supabase
          .from("business_profiles_all")
          .update({
            company_name: data.company_name || "Unknown",
            contact_name: data.contact_name || data.name || "Contact",
            contact_role: data.contact_role || data.role || null,
            product_description: data.product_description || data.what_they_sell || null,
            target_customer: data.target_customer || null,
            primary_niche: data.niche || data.primary_niche || "Other",
            budget_range: data.budget_range || null,
            campaign_goal: data.campaign_goal || null,
            campaign_outcome: data.campaign_outcome || null,
            preferred_creator_type: data.preferred_creator_type || "any",
            preferred_creator_size: data.preferred_creator_size || "any",
            partner_preference: data.partner_preference || "all",
            email: data.email || null,
            phone,
            referral_source: data.referral_source || data.referral || null,
            onboarding_status: "whatsapp_active",
            claimed_at: new Date().toISOString(),
          })
          .eq("id", shadow.id)
          .eq("onboarding_status", "shadow")
          .select("id")
          .maybeSingle();
        if (promoted?.id && !promoteErr) {
          return { id: promoted.id, userType: "business" };
        }
        // Fall through to insert if the shadow got claimed between check + update
      }
    }

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
        campaign_outcome: data.campaign_outcome || null,
        preferred_creator_type: data.preferred_creator_type || "any",
        preferred_creator_size: data.preferred_creator_size || "any",
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

  // Shadow-claim path for creators: if a scraped shadow row matches the
  // provided url, promote it instead of inserting a duplicate.
  const creatorUrl = (data.url as string | undefined) || "";
  if (creatorUrl) {
    const { data: shadow } = await supabase
      .from("newsletter_directory")
      .select("id, onboarding_status")
      .eq("onboarding_status", "shadow")
      .eq("url", creatorUrl)
      .limit(1)
      .maybeSingle();
    if (shadow?.id) {
      const audienceNum = data.audience_size ? parseInt(String(data.audience_size).replace(/[,\s]/g, ""), 10) : null;
      const engRate = data.engagement_rate ? parseFloat(String(data.engagement_rate).replace(/%/g, "")) : null;
      const engRateDecimal = engRate != null && !isNaN(engRate) ? (engRate > 1 ? engRate / 100 : engRate) : null;

      const { data: promoted, error: promoteErr } = await supabase
        .from("newsletter_profiles_all")
        .update({
          newsletter_name: data.channel_name || data.name || "Unknown",
          owner_name: data.owner_name || data.name || "Creator",
          platform: data.platform || null,
          primary_niche: data.niche || data.primary_niche || "Other",
          description: data.description || null,
          subscriber_count: audienceNum,
          audience_reach: audienceNum,
          engagement_rate: engRateDecimal,
          price_per_placement: isNaN(priceCents as number) ? null : priceCents,
          email: data.email || null,
          phone,
          referral_source: data.referral_source || data.referral || null,
          onboarding_status: "whatsapp_active",
          claimed_at: new Date().toISOString(),
        })
        .eq("id", shadow.id)
        .eq("onboarding_status", "shadow")
        .select("id")
        .maybeSingle();
      if (promoted?.id && !promoteErr) {
        return { id: promoted.id, userType: "newsletter" };
      }
    }
  }

  const rawName = (data.channel_name || data.name || "creator") as string;
  const slug = rawName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Math.random().toString(36).slice(2, 6);

  const audienceNum = data.audience_size ? parseInt(String(data.audience_size).replace(/[,\s]/g, ""), 10) : null;
  const engRate = data.engagement_rate ? parseFloat(String(data.engagement_rate).replace(/%/g, "")) : null;
  const engRateDecimal = engRate != null && !isNaN(engRate) ? (engRate > 1 ? engRate / 100 : engRate) : null;

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
      subscriber_count: audienceNum,
      audience_reach: audienceNum,
      engagement_rate: engRateDecimal,
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
