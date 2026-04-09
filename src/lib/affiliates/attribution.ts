/**
 * Affiliate attribution resolution.
 *
 * The 4 attribution paths in priority order (first-write-wins):
 *   1. manual_intro / email_match  — affiliate filled out a form with this email
 *   2. code_at_signup              — user typed the referral code during onboarding
 *   3. cookie                      — user visited /r/[code] within the last 30 days
 *
 * `resolveAttribution()` is called once per profile creation (from
 * /api/onboard/route.ts). It resolves which affiliate (if any) gets
 * credit, sets affiliate_id on the profile, and creates the
 * affiliate_referrals row.
 *
 * Self-referral protection: an affiliate can't attribute their own
 * profile (the `*_profile_id` fields on the affiliates row are
 * checked).
 */

import { createServiceClient } from "@/lib/supabase";
import { AFFILIATE_CONFIG } from "./config";
import { isValidCodeShape, normalizeCode } from "./codes";
import type { ReferralRole } from "./types";

export interface AttributionInputs {
  /** Profile that was just created */
  profileType: ReferralRole;
  profileId: string;
  email: string;

  /** Optional code the user typed at signup */
  signupCode?: string | null;

  /** Optional affiliate ID from the cookie */
  cookieAffiliateId?: string | null;

  /** Optional metadata for audit */
  ipHash?: string | null;
  userAgent?: string | null;
  utm?: string | null;
}

export interface AttributionResult {
  attributed: boolean;
  affiliate_id?: string;
  referral_id?: string;
  method?: "manual_intro" | "email_match" | "code_at_signup" | "cookie";
  reason_skipped?: string;
}

/**
 * Run the attribution resolution chain. Sets affiliate_id on the
 * profile and creates the affiliate_referrals row if attribution
 * is found. Idempotent — re-running on a profile that already has
 * an affiliate_id is a no-op.
 */
export async function resolveAttribution(
  inputs: AttributionInputs,
): Promise<AttributionResult> {
  const supabase = createServiceClient();
  const profileTable = profileTableName(inputs.profileType);

  // Check if this profile already has an affiliate_id (idempotency)
  const { data: existing } = await supabase
    .from(profileTable)
    .select("affiliate_id, email")
    .eq("id", inputs.profileId)
    .maybeSingle();

  if (!existing) {
    return { attributed: false, reason_skipped: "profile not found" };
  }
  if (existing.affiliate_id) {
    return { attributed: false, reason_skipped: "already attributed" };
  }

  // ---------- Path 1: email match against pending manual intros ----------
  const matchedReferral = await findPendingReferralByEmail(inputs.email);
  if (matchedReferral) {
    if (await isSelfReferral(matchedReferral.affiliate_id, inputs.profileType, inputs.profileId)) {
      await markReferralRejected(matchedReferral.id, "self_referral");
      // Fall through to next path
    } else {
      const ok = await bindAndCommit(
        matchedReferral.id,
        matchedReferral.affiliate_id,
        inputs,
        "email_match",
      );
      if (ok) {
        return {
          attributed: true,
          affiliate_id: matchedReferral.affiliate_id,
          referral_id: matchedReferral.id,
          method: "email_match",
        };
      }
    }
  }

  // ---------- Path 2: explicit code at signup ----------
  if (inputs.signupCode) {
    const normalized = normalizeCode(inputs.signupCode);
    if (isValidCodeShape(normalized)) {
      const affiliate = await findActiveAffiliateByCode(normalized);
      if (affiliate) {
        if (await isSelfReferral(affiliate.id, inputs.profileType, inputs.profileId)) {
          // Skip self-referral, fall through to cookie
        } else {
          const referralId = await createSignedUpReferral(
            affiliate.id,
            inputs,
            "code_at_signup",
          );
          if (referralId) {
            return {
              attributed: true,
              affiliate_id: affiliate.id,
              referral_id: referralId,
              method: "code_at_signup",
            };
          }
        }
      }
    }
  }

  // ---------- Path 3: cookie ----------
  if (inputs.cookieAffiliateId) {
    const affiliate = await findActiveAffiliateById(inputs.cookieAffiliateId);
    if (affiliate) {
      if (!(await isSelfReferral(affiliate.id, inputs.profileType, inputs.profileId))) {
        const referralId = await createSignedUpReferral(
          affiliate.id,
          inputs,
          "cookie",
        );
        if (referralId) {
          return {
            attributed: true,
            affiliate_id: affiliate.id,
            referral_id: referralId,
            method: "cookie",
          };
        }
      }
    }
  }

  return { attributed: false, reason_skipped: "no matching attribution" };
}

// ---------------------------------------------------------------- internals

function profileTableName(role: ReferralRole): string {
  switch (role) {
    case "newsletter":
      return "newsletter_profiles";
    case "business":
      return "business_profiles";
    case "other":
      return "other_profiles";
  }
}

function profileFkColumn(role: ReferralRole): string {
  switch (role) {
    case "newsletter":
      return "newsletter_profile_id";
    case "business":
      return "business_profile_id";
    case "other":
      return "other_profile_id";
  }
}

async function findPendingReferralByEmail(email: string): Promise<{
  id: string;
  affiliate_id: string;
} | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("affiliate_referrals")
    .select("id, affiliate_id, expires_at")
    .ilike("pending_email", email)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id, affiliate_id: data.affiliate_id } : null;
}

async function findActiveAffiliateByCode(code: string): Promise<{ id: string } | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("affiliates")
    .select("id, status")
    .eq("referral_code", code)
    .maybeSingle();
  if (!data || data.status !== "active") return null;
  return { id: data.id };
}

async function findActiveAffiliateById(id: string): Promise<{ id: string } | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("affiliates")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (!data || data.status !== "active") return null;
  return { id: data.id };
}

async function isSelfReferral(
  affiliateId: string,
  profileType: ReferralRole,
  profileId: string,
): Promise<boolean> {
  const supabase = createServiceClient();
  const fkCol = profileFkColumn(profileType);
  const { data } = await supabase
    .from("affiliates")
    .select(`id, ${fkCol}`)
    .eq("id", affiliateId)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (data && (data as any)[fkCol] === profileId) return true;
  return false;
}

async function bindAndCommit(
  referralId: string,
  affiliateId: string,
  inputs: AttributionInputs,
  method: "email_match" | "manual_intro",
): Promise<boolean> {
  const supabase = createServiceClient();
  const fkCol = profileFkColumn(inputs.profileType);

  // Update the existing pending referral row to bound state
  const update: Record<string, unknown> = {
    [fkCol]: inputs.profileId,
    status: "signed_up",
    signed_up_at: new Date().toISOString(),
    attribution_method: method,
    pending_email: null,
    pending_name: null,
    pending_role: null,
    attribution_metadata: {
      ip_hash: inputs.ipHash ?? null,
      user_agent: inputs.userAgent ?? null,
      utm: inputs.utm ?? null,
    },
  };
  const { error: refErr } = await supabase
    .from("affiliate_referrals")
    .update(update)
    .eq("id", referralId);
  if (refErr) {
    console.error("affiliate_referrals update failed:", refErr);
    return false;
  }

  // Set affiliate_id on the profile
  const profileTable = profileTableName(inputs.profileType);
  const { error: profErr } = await supabase
    .from(profileTable)
    .update({ affiliate_id: affiliateId })
    .eq("id", inputs.profileId);
  if (profErr) {
    console.error("profile affiliate_id update failed:", profErr);
    return false;
  }

  // Bump affiliate.lifetime_referrals
  await bumpLifetimeReferrals(affiliateId);
  return true;
}

async function createSignedUpReferral(
  affiliateId: string,
  inputs: AttributionInputs,
  method: "code_at_signup" | "cookie",
): Promise<string | null> {
  const supabase = createServiceClient();
  const fkCol = profileFkColumn(inputs.profileType);
  const expiresAt = new Date(
    Date.now() + AFFILIATE_CONFIG.PENDING_INTRO_DAYS * 86400 * 1000,
  );

  const { data, error } = await supabase
    .from("affiliate_referrals")
    .insert({
      affiliate_id: affiliateId,
      [fkCol]: inputs.profileId,
      attribution_method: method,
      attribution_metadata: {
        ip_hash: inputs.ipHash ?? null,
        user_agent: inputs.userAgent ?? null,
        utm: inputs.utm ?? null,
      },
      status: "signed_up",
      signed_up_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("affiliate_referrals insert failed:", error);
    return null;
  }

  // Set affiliate_id on the profile
  const profileTable = profileTableName(inputs.profileType);
  const { error: profErr } = await supabase
    .from(profileTable)
    .update({ affiliate_id: affiliateId })
    .eq("id", inputs.profileId);
  if (profErr) {
    console.error("profile affiliate_id update failed:", profErr);
  }

  await bumpLifetimeReferrals(affiliateId);
  return data.id;
}

async function bumpLifetimeReferrals(affiliateId: string): Promise<void> {
  const supabase = createServiceClient();
  // Best-effort increment. Concurrency-wise, two profiles could attribute
  // simultaneously and one increment could be lost — that's a tolerable
  // approximation for a denormalized stat. The source of truth is COUNT(*)
  // on affiliate_referrals.
  const { data: aff } = await supabase
    .from("affiliates")
    .select("lifetime_referrals")
    .eq("id", affiliateId)
    .single();
  if (aff) {
    await supabase
      .from("affiliates")
      .update({ lifetime_referrals: (aff.lifetime_referrals ?? 0) + 1 })
      .eq("id", affiliateId);
  }
}

async function markReferralRejected(referralId: string, reason: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("affiliate_referrals")
    .update({
      status: reason === "self_referral" ? "rejected_self_referral" : "expired",
    })
    .eq("id", referralId);
}
