/**
 * Common Supabase query helpers for affiliate routes.
 *
 * Centralized so dashboard / admin / cron all read consistent data.
 */

import { createServiceClient } from "@/lib/supabase";
import type {
  Affiliate,
  AffiliateCommission,
  AffiliatePayout,
  AffiliateReferral,
  CommissionStatus,
} from "./types";

// ---------------------------------------------------------------- affiliates

export async function getAffiliateById(id: string): Promise<Affiliate | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("affiliates").select("*").eq("id", id).maybeSingle();
  return (data as Affiliate | null) ?? null;
}

export async function getAffiliateByCode(code: string): Promise<Affiliate | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("affiliates")
    .select("*")
    .eq("referral_code", code.toUpperCase())
    .maybeSingle();
  return (data as Affiliate | null) ?? null;
}

export async function listAffiliatesByStatus(
  status: "pending" | "active" | "suspended" | "banned",
): Promise<Affiliate[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("affiliates")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false });
  return (data as Affiliate[] | null) ?? [];
}

// ---------------------------------------------------------------- referrals

export async function listReferralsByAffiliate(
  affiliateId: string,
  options: { status?: string; limit?: number } = {},
): Promise<AffiliateReferral[]> {
  const supabase = createServiceClient();
  let q = supabase
    .from("affiliate_referrals")
    .select("*")
    .eq("affiliate_id", affiliateId)
    .order("created_at", { ascending: false });
  if (options.status) q = q.eq("status", options.status);
  if (options.limit) q = q.limit(options.limit);
  const { data } = await q;
  return (data as AffiliateReferral[] | null) ?? [];
}

// ---------------------------------------------------------------- commissions

export async function listCommissionsByAffiliate(
  affiliateId: string,
  options: { statuses?: CommissionStatus[]; limit?: number } = {},
): Promise<AffiliateCommission[]> {
  const supabase = createServiceClient();
  let q = supabase
    .from("affiliate_commissions")
    .select("*")
    .eq("affiliate_id", affiliateId)
    .order("created_at", { ascending: false });
  if (options.statuses && options.statuses.length > 0) {
    q = q.in("status", options.statuses);
  }
  if (options.limit) q = q.limit(options.limit);
  const { data } = await q;
  return (data as AffiliateCommission[] | null) ?? [];
}

export interface CommissionTotals {
  pending_cents: number;
  payable_cents: number;
  paid_cents: number;
  clawback_pending_cents: number; // negative number
  total_lifetime_cents: number;
  pending_count: number;
  payable_count: number;
  paid_count: number;
}

export async function getCommissionTotals(
  affiliateId: string,
): Promise<CommissionTotals> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("affiliate_commissions")
    .select("status, commission_cents")
    .eq("affiliate_id", affiliateId);

  const totals: CommissionTotals = {
    pending_cents: 0,
    payable_cents: 0,
    paid_cents: 0,
    clawback_pending_cents: 0,
    total_lifetime_cents: 0,
    pending_count: 0,
    payable_count: 0,
    paid_count: 0,
  };
  for (const row of data ?? []) {
    const cents = row.commission_cents as number;
    switch (row.status) {
      case "pending":
        totals.pending_cents += cents;
        totals.pending_count += 1;
        break;
      case "payable":
        totals.payable_cents += cents;
        totals.payable_count += 1;
        break;
      case "paid":
      case "clawback_applied":
        totals.paid_cents += cents;
        totals.paid_count += 1;
        break;
      case "clawback_pending":
        totals.clawback_pending_cents += cents; // already negative
        break;
    }
    if (row.status !== "cancelled") {
      totals.total_lifetime_cents += cents;
    }
  }
  return totals;
}

// ---------------------------------------------------------------- payouts

export async function listPayoutsByAffiliate(
  affiliateId: string,
): Promise<AffiliatePayout[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("affiliate_payouts")
    .select("*")
    .eq("affiliate_id", affiliateId)
    .order("created_at", { ascending: false });
  return (data as AffiliatePayout[] | null) ?? [];
}
