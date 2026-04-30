/**
 * Durable state for WhatsApp onboarding conversations.
 *
 * Replaces the prior `[STATE]{json}` marker protocol where the AI emitted
 * its working state in each reply for the system to parse back out.
 * Failure modes from that approach: model occasionally forgot the marker
 * (state reset to empty), occasionally emitted malformed JSON (state
 * silently lost), state existed only in chat history (couldn't recover
 * across sessions).
 *
 * New design: state lives in `onboarding_states` table, keyed by phone.
 * Updated via Anthropic tool calls (`record_field`). Injected into the
 * system prompt each turn so the model always has a current snapshot
 * without having to track it in its own output. Cleared on profile
 * creation.
 */
import { createServiceClient } from "./supabase";

export type UserType = "influencer" | "business";

export interface OnboardingState {
  user_type?: UserType | null;
  // Influencer fields
  name?: string | null;
  platform?: string | null;
  channel_name?: string | null;
  url?: string | null;
  niche?: string | null;
  audience_size?: number | null;
  engagement_rate?: number | null;
  price_per_placement?: number | null;
  email?: string | null;
  // Business fields
  contact_name?: string | null;
  contact_role?: string | null;
  company_name?: string | null;
  website_url?: string | null;
  product_description?: string | null;
  target_customer?: string | null;
  buyer_description?: string | null;
  past_newsletter_sponsors?: string | null;
  budget_range?: string | null;
  campaign_outcome?: string | null;
  preferred_creator_type?: string | null;
  preferred_creator_size?: string | null;
  // Common
  referral_source?: string | null;
}

/** Fields required to mark onboarding complete (mirrors the old REQUIRED_FIELDS). */
const REQUIRED_FIELDS: Record<UserType, (keyof OnboardingState)[]> = {
  influencer: ["user_type", "name", "platform", "channel_name", "niche", "audience_size", "email"],
  business:   ["user_type", "contact_name", "company_name", "product_description", "target_customer", "niche", "budget_range", "campaign_outcome", "email", "website_url"],
};

const ALL_FIELDS: (keyof OnboardingState)[] = [
  "user_type", "name", "platform", "channel_name", "url", "niche", "audience_size",
  "engagement_rate", "price_per_placement", "email",
  "contact_name", "contact_role", "company_name", "website_url", "product_description",
  "target_customer", "buyer_description", "past_newsletter_sponsors", "budget_range",
  "campaign_outcome", "preferred_creator_type", "preferred_creator_size",
  "referral_source",
];

export const ONBOARDING_FIELD_NAMES = ALL_FIELDS as readonly string[];

/** Read state for a phone, returning empty object if no row exists. */
export async function getOnboardingState(phone: string): Promise<OnboardingState> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("onboarding_states")
    .select("state")
    .eq("phone", phone)
    .maybeSingle();
  return (data?.state as OnboardingState) || {};
}

/**
 * Set a single field. Coerces numeric fields. Upserts so the first call
 * for a phone creates the row.
 */
export async function setOnboardingField(
  phone: string,
  field: keyof OnboardingState,
  rawValue: unknown,
): Promise<OnboardingState> {
  if (!ALL_FIELDS.includes(field)) {
    throw new Error(`unknown onboarding field: ${field}`);
  }

  // Numeric coercion
  const numericFields = new Set(["audience_size", "engagement_rate", "price_per_placement"]);
  let value: string | number | null = null;
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    value = null;
  } else if (numericFields.has(field as string)) {
    const cleaned = String(rawValue).replace(/[$,]/g, "");
    const n = parseFloat(cleaned);
    value = Number.isFinite(n) ? n : null;
  } else {
    value = String(rawValue).slice(0, 2000);
  }

  const supabase = createServiceClient();

  // Read existing → merge → write. Upsert with merge would be cleaner but
  // Postgres jsonb_set doesn't support arbitrary keys via Supabase client,
  // so do read-modify-write in app code (single-writer per phone in
  // practice — webhook is serial per user).
  const { data: existing } = await supabase
    .from("onboarding_states")
    .select("state")
    .eq("phone", phone)
    .maybeSingle();

  const merged: OnboardingState = { ...((existing?.state as OnboardingState) || {}), [field]: value };

  await supabase
    .from("onboarding_states")
    .upsert(
      {
        phone,
        state: merged,
        user_type: (merged.user_type as string) || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "phone" },
    );

  return merged;
}

export async function clearOnboardingState(phone: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("onboarding_states").delete().eq("phone", phone);
}

export function isOnboardingComplete(state: OnboardingState): boolean {
  const ut = state.user_type;
  if (ut !== "influencer" && ut !== "business") return false;
  return REQUIRED_FIELDS[ut].every((k) => {
    const v = state[k];
    return v !== null && v !== undefined && v !== "";
  });
}

/** Render the state as a compact bullet list for the system prompt. */
export function formatStateForPrompt(state: OnboardingState): string {
  const knownEntries = ALL_FIELDS
    .map((f) => [f, state[f]] as const)
    .filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (knownEntries.length === 0) return "Current state: (nothing collected yet)";
  const lines = knownEntries.map(([k, v]) => `- ${k}: ${v}`);
  return "Current state (already collected — DO NOT ask again):\n" + lines.join("\n");
}
