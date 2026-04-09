/**
 * TypeScript types matching the affiliate program DB schema.
 *
 * Mirrors `supabase/migrations/20240101000016_affiliate_program.sql`.
 * Update both files together when adding columns.
 */

export type AffiliateStatus = "pending" | "active" | "suspended" | "banned";
export type AffiliateTier = "standard" | "silver" | "gold";

export interface Affiliate {
  id: string;
  email: string;
  full_name: string;
  display_name: string | null;
  phone: string;
  bio: string | null;
  network_description: string | null;
  referral_code: string;
  stripe_account_id: string | null;
  stripe_payouts_enabled: boolean;
  newsletter_profile_id: string | null;
  business_profile_id: string | null;
  other_profile_id: string | null;
  status: AffiliateStatus;
  suspended_reason: string | null;
  custom_rate_bps: number | null;
  tier: AffiliateTier;
  lifetime_referrals: number;
  lifetime_deals: number;
  lifetime_earned_cents: number;
  lifetime_paid_cents: number;
  approved_at: string | null;
  approved_by_admin: string | null;
  created_at: string;
  updated_at: string;
}

export type ReferralRole = "newsletter" | "business" | "other";

export type AttributionMethod =
  | "manual_intro"
  | "email_match"
  | "cookie"
  | "code_at_signup"
  | "admin_override";

export type ReferralStatus =
  | "pending"
  | "signed_up"
  | "expired"
  | "rejected_self_referral"
  | "admin_revoked";

export interface AffiliateReferral {
  id: string;
  affiliate_id: string;
  newsletter_profile_id: string | null;
  business_profile_id: string | null;
  other_profile_id: string | null;
  pending_email: string | null;
  pending_name: string | null;
  pending_role: ReferralRole | null;
  pending_intro_note: string | null;
  attribution_method: AttributionMethod;
  attribution_metadata: Record<string, unknown> | null;
  status: ReferralStatus;
  signed_up_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export type AttributedSide = "brand" | "creator" | "both";

export type CommissionStatus =
  | "pending"
  | "payable"
  | "paid"
  | "clawback_pending"
  | "clawback_applied"
  | "cancelled";

export interface AffiliateCommission {
  id: string;
  affiliate_id: string;
  referral_id: string;
  transaction_id: string;
  deal_gross_cents: number;
  commission_rate_bps: number;
  commission_cents: number;
  attributed_side: AttributedSide;
  status: CommissionStatus;
  cancelled_reason: string | null;
  payable_at: string | null;
  paid_at: string | null;
  payout_id: string | null;
  created_at: string;
  updated_at: string;
}

export type PayoutStatus = "queued" | "processing" | "paid" | "failed" | "reversed";

export interface AffiliatePayout {
  id: string;
  affiliate_id: string;
  amount_cents: number;
  commission_count: number;
  status: PayoutStatus;
  stripe_transfer_id: string | null;
  failure_reason: string | null;
  period_start: string;
  period_end: string;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AffiliateSession {
  id: string;
  affiliate_id: string;
  token_hash: string | null;
  magic_token_hash: string | null;
  magic_expires_at: string | null;
  magic_consumed_at: string | null;
  ip_hash: string | null;
  user_agent: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}
