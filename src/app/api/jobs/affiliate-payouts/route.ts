/**
 * POST /api/jobs/affiliate-payouts
 *
 * Monthly payout cron for affiliates. Should run on the 1st of each month.
 *
 * For each active affiliate with stripe_payouts_enabled=true:
 *   1. Sum all `payable` commissions
 *   2. Sum all `clawback_pending` commissions (negative)
 *   3. Net the two
 *   4. If net >= MIN_PAYOUT_CENTS: Stripe transfer, mark commissions as paid
 *   5. If net < MIN_PAYOUT_CENTS: roll forward (no row created, commissions stay payable)
 *   6. If net <= 0: clawbacks exceed earnings, leave clawback_pending in place
 *
 * Concurrency: each affiliate is processed serially. The function is
 * idempotent — re-running on the same day is safe because we filter
 * out commissions already in `paid` status.
 *
 * Phase 2 — requires Stripe Connect enabled at the platform level.
 *
 * Auth: Bearer ${CRON_SECRET} matches the existing Stroby cron pattern.
 */
import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { AFFILIATE_CONFIG } from "@/lib/affiliates/config";
import { notifyPayoutSent, notifyPayoutRolledForward } from "@/lib/affiliates/notify";
import type { Affiliate, AffiliateCommission } from "@/lib/affiliates/types";

interface PayoutResult {
  affiliate_id: string;
  full_name: string;
  paid: boolean;
  amount_cents: number;
  commission_count: number;
  payout_id?: string;
  rolled_forward?: boolean;
  reason?: string;
  error?: string;
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const stripe = getStripe();

  const { data: affiliates, error } = await supabase
    .from("affiliates")
    .select("*")
    .eq("status", "active")
    .eq("stripe_payouts_enabled", true);

  if (error) {
    console.error("affiliate payout: failed to list affiliates:", error);
    return Response.json({ error: "Failed to list affiliates" }, { status: 500 });
  }

  const results: PayoutResult[] = [];

  for (const affRaw of affiliates ?? []) {
    const aff = affRaw as Affiliate;
    if (!aff.stripe_account_id) {
      results.push({
        affiliate_id: aff.id,
        full_name: aff.full_name,
        paid: false,
        amount_cents: 0,
        commission_count: 0,
        reason: "no stripe_account_id",
      });
      continue;
    }

    // Fetch all commissions in payable + clawback_pending state
    const { data: rows } = await supabase
      .from("affiliate_commissions")
      .select("*")
      .eq("affiliate_id", aff.id)
      .in("status", ["payable", "clawback_pending"]);

    const commissions = (rows ?? []) as AffiliateCommission[];
    if (commissions.length === 0) {
      results.push({
        affiliate_id: aff.id,
        full_name: aff.full_name,
        paid: false,
        amount_cents: 0,
        commission_count: 0,
        reason: "no payable commissions",
      });
      continue;
    }

    // Net the amounts (positives + negatives sum)
    const netCents = commissions.reduce((sum, c) => sum + c.commission_cents, 0);
    const positiveIds = commissions
      .filter((c) => c.status === "payable")
      .map((c) => c.id);
    const clawbackIds = commissions
      .filter((c) => c.status === "clawback_pending")
      .map((c) => c.id);

    // Below minimum or net negative: roll forward
    if (netCents <= 0 || netCents < AFFILIATE_CONFIG.MIN_PAYOUT_CENTS) {
      results.push({
        affiliate_id: aff.id,
        full_name: aff.full_name,
        paid: false,
        amount_cents: netCents,
        commission_count: commissions.length,
        rolled_forward: true,
        reason: netCents <= 0 ? "net negative or zero" : "below minimum payout",
      });
      // Notify the affiliate if this is a rollover with positive earnings
      if (netCents > 0) {
        await notifyPayoutRolledForward(aff, netCents);
      }
      continue;
    }

    // Create the payout row first (status='processing')
    const today = new Date();
    const periodStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      .toISOString()
      .slice(0, 10);
    const periodEnd = new Date(today.getFullYear(), today.getMonth(), 0)
      .toISOString()
      .slice(0, 10);

    const { data: payoutRow, error: payoutErr } = await supabase
      .from("affiliate_payouts")
      .insert({
        affiliate_id: aff.id,
        amount_cents: netCents,
        commission_count: commissions.length,
        status: "processing",
        period_start: periodStart,
        period_end: periodEnd,
      })
      .select("id")
      .single();

    if (payoutErr || !payoutRow) {
      console.error("affiliate payout row insert failed:", payoutErr);
      results.push({
        affiliate_id: aff.id,
        full_name: aff.full_name,
        paid: false,
        amount_cents: netCents,
        commission_count: commissions.length,
        error: "Failed to create payout row",
      });
      continue;
    }

    // Stripe transfer
    let transferId: string | null = null;
    try {
      const transfer = await stripe.transfers.create({
        amount: netCents,
        currency: "usd",
        destination: aff.stripe_account_id,
        metadata: {
          affiliate_id: aff.id,
          payout_id: payoutRow.id,
          period_start: periodStart,
          period_end: periodEnd,
        },
      });
      transferId = transfer.id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`affiliate stripe transfer failed for ${aff.id}:`, msg);
      // Mark the payout as failed
      await supabase
        .from("affiliate_payouts")
        .update({
          status: "failed",
          failure_reason: msg.slice(0, 500),
        })
        .eq("id", payoutRow.id);
      results.push({
        affiliate_id: aff.id,
        full_name: aff.full_name,
        paid: false,
        amount_cents: netCents,
        commission_count: commissions.length,
        error: msg,
      });
      continue;
    }

    // Mark payout as paid
    await supabase
      .from("affiliate_payouts")
      .update({
        status: "paid",
        stripe_transfer_id: transferId,
        paid_at: new Date().toISOString(),
      })
      .eq("id", payoutRow.id);

    // Flip positive commissions to 'paid' and link to the payout row
    if (positiveIds.length > 0) {
      await supabase
        .from("affiliate_commissions")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          payout_id: payoutRow.id,
        })
        .in("id", positiveIds);
    }
    // Flip clawback_pending rows to clawback_applied
    if (clawbackIds.length > 0) {
      await supabase
        .from("affiliate_commissions")
        .update({
          status: "clawback_applied",
          paid_at: new Date().toISOString(),
          payout_id: payoutRow.id,
        })
        .in("id", clawbackIds);
    }

    // Bump lifetime_paid_cents on the affiliate
    await supabase
      .from("affiliates")
      .update({
        lifetime_paid_cents: (aff.lifetime_paid_cents ?? 0) + netCents,
      })
      .eq("id", aff.id);

    // Notify
    await notifyPayoutSent(aff, netCents);

    results.push({
      affiliate_id: aff.id,
      full_name: aff.full_name,
      paid: true,
      amount_cents: netCents,
      commission_count: commissions.length,
      payout_id: payoutRow.id,
    });
  }

  return Response.json({
    processed: affiliates?.length ?? 0,
    paid: results.filter((r) => r.paid).length,
    rolled_forward: results.filter((r) => r.rolled_forward).length,
    failed: results.filter((r) => r.error).length,
    results,
  });
}
