/**
 * Shadow → real promotion. Runs in a single conditional UPDATE so
 * simultaneous claim attempts can't double-promote.
 */
import { createServiceClient } from "@/lib/supabase";

export interface ClaimBrandInput {
  company_name?: string;
  contact_name?: string;
  contact_role?: string | null;
  phone: string;
  email?: string | null;
  budget_range?: string | null;
  primary_niche?: string | null;
}

export interface ClaimCreatorInput {
  newsletter_name?: string;
  owner_name?: string;
  phone: string;
  email?: string | null;
  primary_niche?: string | null;
  subscriber_count?: number | null;
}

export interface ClaimResult {
  ok: boolean;
  id?: string;
  error?: "not_found" | "already_claimed" | "db_error";
  message?: string;
}

const ALLOWED_BRAND_UPDATES = new Set([
  "company_name", "contact_name", "contact_role", "phone", "email",
  "budget_range", "primary_niche",
]);

const ALLOWED_CREATOR_UPDATES = new Set([
  "newsletter_name", "owner_name", "phone", "email",
  "primary_niche", "subscriber_count",
]);

function pickAllowed(input: Record<string, unknown>, allowed: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (allowed.has(k) && v !== undefined && v !== null && v !== "") {
      out[k] = v;
    }
  }
  return out;
}

export async function claimShadowBrand(
  profileId: string,
  input: ClaimBrandInput
): Promise<ClaimResult> {
  if (!input.phone) return { ok: false, error: "db_error", message: "phone required" };

  const supabase = createServiceClient();
  const updates = {
    ...pickAllowed(input as unknown as Record<string, unknown>, ALLOWED_BRAND_UPDATES),
    onboarding_status: "whatsapp_active",
    claimed_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("business_profiles_all")
    .update(updates)
    .eq("id", profileId)
    .eq("onboarding_status", "shadow")
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: "db_error", message: error.message };
  if (!data) {
    // Already claimed or missing — check which
    const { data: existing } = await supabase
      .from("business_directory")
      .select("id, onboarding_status")
      .eq("id", profileId)
      .maybeSingle();
    if (!existing) return { ok: false, error: "not_found" };
    return { ok: false, error: "already_claimed" };
  }
  return { ok: true, id: data.id };
}

export async function claimShadowCreator(
  profileId: string,
  input: ClaimCreatorInput
): Promise<ClaimResult> {
  if (!input.phone) return { ok: false, error: "db_error", message: "phone required" };

  const supabase = createServiceClient();
  const updates = {
    ...pickAllowed(input as unknown as Record<string, unknown>, ALLOWED_CREATOR_UPDATES),
    onboarding_status: "whatsapp_active",
    claimed_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("newsletter_profiles_all")
    .update(updates)
    .eq("id", profileId)
    .eq("onboarding_status", "shadow")
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: "db_error", message: error.message };
  if (!data) {
    const { data: existing } = await supabase
      .from("newsletter_directory")
      .select("id, onboarding_status")
      .eq("id", profileId)
      .maybeSingle();
    if (!existing) return { ok: false, error: "not_found" };
    return { ok: false, error: "already_claimed" };
  }
  return { ok: true, id: data.id };
}
