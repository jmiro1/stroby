/**
 * Shadow-claim outreach.
 *
 * When the matching engine proposes a shadow brand/creator to a real
 * counterparty, this module is called to notify the shadow profile
 * (cold email) with a signed claim link. On claim, the introduction
 * transitions from 'awaiting_claim' → normal flow.
 *
 * V1 STUB: we just log + write an audit row. Real cold-email integration
 * (Smartlead or equivalent) comes in a follow-up. Until then, ops reviews
 * introductions WHERE status='awaiting_claim' and sends manually.
 */
import { createServiceClient } from "@/lib/supabase";
import { signClaimToken } from "./tokens";

const DEFAULT_TTL_DAYS = 14;

export interface ShadowOutreachInput {
  profile_id: string;
  profile_type: "brand" | "creator";
  introduction_id?: string; // optional link back to the introduction that triggered this
  counterparty_id?: string;
  counterparty_name?: string;
  counterparty_niche?: string;
}

export interface ShadowOutreachResult {
  ok: boolean;
  claim_url?: string;
  error?: string;
}

function getPublicBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://stroby.ai";
}

export async function fireShadowClaimOutreach(input: ShadowOutreachInput): Promise<ShadowOutreachResult> {
  const { profile_id, profile_type } = input;

  let token: string;
  try {
    token = signClaimToken(profile_id, profile_type, DEFAULT_TTL_DAYS);
  } catch (e) {
    return { ok: false, error: `sign_failed: ${String(e)}` };
  }

  const claim_url = `${getPublicBaseUrl()}/claim/${token}`;

  // Log for now. Real integration plugs in here.
  console.log(
    JSON.stringify({
      event: "shadow_claim_outreach_pending",
      profile_id,
      profile_type,
      claim_url,
      counterparty_id: input.counterparty_id || null,
      counterparty_name: input.counterparty_name || null,
      counterparty_niche: input.counterparty_niche || null,
      introduction_id: input.introduction_id || null,
      ttl_days: DEFAULT_TTL_DAYS,
    })
  );

  // Best-effort audit row on the profile (non-blocking). Uses service_role;
  // RLS bypassed.
  try {
    const supabase = createServiceClient();
    const table = profile_type === "brand" ? "business_profiles_all" : "newsletter_profiles_all";
    await supabase.from(table)
      .update({
        // Bump a light marker so we can find shadows that have been pitched at least once.
        // `claimed_at` stays NULL — only set on actual claim.
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile_id)
      .eq("onboarding_status", "shadow");
  } catch {
    // non-fatal
  }

  return { ok: true, claim_url };
}
