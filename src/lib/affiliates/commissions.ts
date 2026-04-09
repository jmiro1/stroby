/**
 * Affiliate commission engine.
 *
 * The single function `recordCommissionForTransaction(transactionId)` is
 * the heart of the system. It runs immediately after a transaction is
 * marked `released` (i.e., the appeal window has passed and the creator
 * has been paid). It looks up which sides are affiliate-attributed and
 * creates the appropriate commission rows.
 *
 * Cases (locked in AFFILIATE_PRD.md §6 Flow D):
 *   - Neither side has affiliate_id  →  no commission
 *   - One side has affiliate_id      →  one row at full rate
 *   - Both sides, same affiliate     →  one row at full rate, side='both'
 *   - Both sides, different affiliates → two rows at SPLIT rate (5%/5%)
 *
 * Eligibility checks:
 *   - Deal gross >= MIN_DEAL_CENTS (default $200)
 *   - Each profile is within ATTRIBUTION_WINDOW_DAYS of its created_at
 *
 * The function is idempotent: if a commission row already exists for
 * a given (transaction_id, affiliate_id) pair, it does NOT create a
 * duplicate. Re-running on the same transaction is safe.
 */

import { createServiceClient } from "@/lib/supabase";
import {
  AFFILIATE_CONFIG,
  computeCommissionCents,
  resolveRateBps,
} from "./config";
import { notifyCommissionEarned } from "./notify";
import type { Affiliate, AttributedSide } from "./types";

interface RecordResult {
  ok: boolean;
  reason?: string;
  commissions_created: number;
  commission_ids: string[];
}

export async function recordCommissionForTransaction(
  transactionId: string,
): Promise<RecordResult> {
  const supabase = createServiceClient();

  // 1. Fetch the transaction and check it's in a state that should pay commission
  const { data: txn, error: txnErr } = await supabase
    .from("transactions")
    .select("id, introduction_id, business_id, newsletter_id, amount, status")
    .eq("id", transactionId)
    .single();
  if (txnErr || !txn) {
    return { ok: false, reason: "transaction not found", commissions_created: 0, commission_ids: [] };
  }
  if (txn.status !== "released") {
    return {
      ok: false,
      reason: `transaction status is ${txn.status}, not released`,
      commissions_created: 0,
      commission_ids: [],
    };
  }

  // 2. Minimum deal size eligibility
  if (txn.amount < AFFILIATE_CONFIG.MIN_DEAL_CENTS) {
    return {
      ok: true,
      reason: `deal below MIN_DEAL_CENTS (${txn.amount} < ${AFFILIATE_CONFIG.MIN_DEAL_CENTS})`,
      commissions_created: 0,
      commission_ids: [],
    };
  }

  // 3. Look up the introduction to find the creator side (could be newsletter OR other)
  const { data: intro } = await supabase
    .from("introductions")
    .select("id, business_id, newsletter_id, creator_id, creator_type")
    .eq("id", txn.introduction_id)
    .single();
  if (!intro) {
    return { ok: false, reason: "introduction not found", commissions_created: 0, commission_ids: [] };
  }

  // 4. Resolve which profile IDs are on each side
  const businessId: string | null = intro.business_id ?? txn.business_id ?? null;
  // Creator side: prefer creator_id+creator_type from introduction, fall back to newsletter_id
  let creatorProfileId: string | null = null;
  let creatorTable: "newsletter_profiles" | "other_profiles" = "newsletter_profiles";
  if (intro.creator_id && intro.creator_type === "other") {
    creatorProfileId = intro.creator_id;
    creatorTable = "other_profiles";
  } else if (intro.newsletter_id) {
    creatorProfileId = intro.newsletter_id;
    creatorTable = "newsletter_profiles";
  } else if (intro.creator_id) {
    creatorProfileId = intro.creator_id;
    creatorTable = "newsletter_profiles";
  }

  // 5. Pull affiliate_id from each side
  const brandSide = await loadAttributedSide(businessId, "business_profiles");
  const creatorSide = await loadAttributedSide(creatorProfileId, creatorTable);

  // 6. Branch based on which sides are attributed
  if (!brandSide && !creatorSide) {
    return { ok: true, reason: "no affiliate-attributed sides", commissions_created: 0, commission_ids: [] };
  }

  // Idempotency: check whether commissions already exist for this transaction
  const { data: existingRows } = await supabase
    .from("affiliate_commissions")
    .select("id, affiliate_id")
    .eq("transaction_id", transactionId);
  const alreadyAttributed = new Set((existingRows ?? []).map((r) => r.affiliate_id));

  const created: string[] = [];

  // Case A: Both sides exist, same affiliate
  if (
    brandSide &&
    creatorSide &&
    brandSide.affiliate.id === creatorSide.affiliate.id
  ) {
    if (alreadyAttributed.has(brandSide.affiliate.id)) {
      return {
        ok: true,
        reason: "already commissioned (idempotent)",
        commissions_created: 0,
        commission_ids: [],
      };
    }
    const id = await insertCommission(
      brandSide.affiliate,
      brandSide.referralId,
      transactionId,
      txn.amount,
      resolveRateBps(brandSide.affiliate.custom_rate_bps),
      "both",
    );
    if (id) {
      created.push(id);
      await notifyCommissionEarned(
        brandSide.affiliate,
        computeCommissionCents(
          txn.amount,
          resolveRateBps(brandSide.affiliate.custom_rate_bps),
        ),
        creatorSide.profileName ?? brandSide.profileName,
      );
    }
    return { ok: true, commissions_created: created.length, commission_ids: created };
  }

  // Case B: Both sides, different affiliates → 5%/5% split
  if (brandSide && creatorSide) {
    const splitRate = AFFILIATE_CONFIG.SPLIT_COMMISSION_BPS;
    if (!alreadyAttributed.has(brandSide.affiliate.id)) {
      const id = await insertCommission(
        brandSide.affiliate,
        brandSide.referralId,
        transactionId,
        txn.amount,
        splitRate,
        "brand",
      );
      if (id) {
        created.push(id);
        await notifyCommissionEarned(
          brandSide.affiliate,
          computeCommissionCents(txn.amount, splitRate),
          creatorSide.profileName,
        );
      }
    }
    if (!alreadyAttributed.has(creatorSide.affiliate.id)) {
      const id = await insertCommission(
        creatorSide.affiliate,
        creatorSide.referralId,
        transactionId,
        txn.amount,
        splitRate,
        "creator",
      );
      if (id) {
        created.push(id);
        await notifyCommissionEarned(
          creatorSide.affiliate,
          computeCommissionCents(txn.amount, splitRate),
          creatorSide.profileName,
        );
      }
    }
    return { ok: true, commissions_created: created.length, commission_ids: created };
  }

  // Case C: One side only
  const side = brandSide ?? creatorSide!;
  const sideLabel: AttributedSide = brandSide ? "brand" : "creator";
  if (alreadyAttributed.has(side.affiliate.id)) {
    return {
      ok: true,
      reason: "already commissioned (idempotent)",
      commissions_created: 0,
      commission_ids: [],
    };
  }
  const rate = resolveRateBps(side.affiliate.custom_rate_bps);
  const id = await insertCommission(
    side.affiliate,
    side.referralId,
    transactionId,
    txn.amount,
    rate,
    sideLabel,
  );
  if (id) {
    created.push(id);
    await notifyCommissionEarned(
      side.affiliate,
      computeCommissionCents(txn.amount, rate),
      side.profileName,
    );
  }
  return { ok: true, commissions_created: created.length, commission_ids: created };
}

// ---------------------------------------------------------------- helpers

interface AttributedSideInfo {
  affiliate: Affiliate;
  referralId: string;
  profileName: string | null;
}

async function loadAttributedSide(
  profileId: string | null,
  table: "newsletter_profiles" | "business_profiles" | "other_profiles",
): Promise<AttributedSideInfo | null> {
  if (!profileId) return null;
  const supabase = createServiceClient();

  const nameCol =
    table === "newsletter_profiles"
      ? "newsletter_name"
      : table === "business_profiles"
      ? "company_name"
      : "name";

  const { data: profile } = await supabase
    .from(table)
    .select(`id, ${nameCol}, affiliate_id, created_at`)
    .eq("id", profileId)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = profile as any;
  if (!p || !p.affiliate_id) return null;

  // 12-month attribution window check
  const profileAgeMs = Date.now() - new Date(p.created_at).getTime();
  if (profileAgeMs > AFFILIATE_CONFIG.ATTRIBUTION_WINDOW_DAYS * 86400 * 1000) {
    return null;
  }

  // Load the affiliate
  const { data: affiliate } = await supabase
    .from("affiliates")
    .select("*")
    .eq("id", p.affiliate_id)
    .maybeSingle();
  if (!affiliate || affiliate.status !== "active") return null;

  // Find the referral row (most recent for this profile + affiliate)
  const fkCol = profileFkColumn(table);
  const { data: referral } = await supabase
    .from("affiliate_referrals")
    .select("id")
    .eq("affiliate_id", p.affiliate_id)
    .eq(fkCol, profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!referral) return null;

  return {
    affiliate: affiliate as Affiliate,
    referralId: referral.id,
    profileName: p[nameCol] ?? null,
  };
}

function profileFkColumn(
  table: "newsletter_profiles" | "business_profiles" | "other_profiles",
): string {
  switch (table) {
    case "newsletter_profiles":
      return "newsletter_profile_id";
    case "business_profiles":
      return "business_profile_id";
    case "other_profiles":
      return "other_profile_id";
  }
}

async function insertCommission(
  affiliate: Affiliate,
  referralId: string,
  transactionId: string,
  dealGrossCents: number,
  rateBps: number,
  side: AttributedSide,
): Promise<string | null> {
  const supabase = createServiceClient();
  const cents = computeCommissionCents(dealGrossCents, rateBps);
  const payableAt = new Date(
    Date.now() + AFFILIATE_CONFIG.HOLD_DAYS * 86400 * 1000,
  ).toISOString();

  const { data, error } = await supabase
    .from("affiliate_commissions")
    .insert({
      affiliate_id: affiliate.id,
      referral_id: referralId,
      transaction_id: transactionId,
      deal_gross_cents: dealGrossCents,
      commission_rate_bps: rateBps,
      commission_cents: cents,
      attributed_side: side,
      status: "pending",
      payable_at: payableAt,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("affiliate_commissions insert failed:", error);
    return null;
  }

  // Bump lifetime stats (best-effort)
  await supabase
    .from("affiliates")
    .update({
      lifetime_deals: (affiliate.lifetime_deals ?? 0) + 1,
      lifetime_earned_cents: (affiliate.lifetime_earned_cents ?? 0) + cents,
    })
    .eq("id", affiliate.id);

  return data.id;
}

// ---------------------------------------------------------------- clawback (Phase 2 wires this up)

/**
 * Process a refund: cancel pending/payable commissions or create
 * negative clawback rows for already-paid commissions.
 *
 * Called from the Stripe `charge.refunded` webhook (Phase 2). Safe
 * to define now so the API surface is stable.
 */
export async function processRefundClawback(
  transactionId: string,
  reason: string,
): Promise<{ cancelled: number; clawbacks_created: number }> {
  const supabase = createServiceClient();

  const { data: rows } = await supabase
    .from("affiliate_commissions")
    .select("*")
    .eq("transaction_id", transactionId);

  let cancelled = 0;
  let clawbacks = 0;

  for (const row of rows ?? []) {
    if (row.status === "pending" || row.status === "payable") {
      await supabase
        .from("affiliate_commissions")
        .update({
          status: "cancelled",
          cancelled_reason: `refund: ${reason}`,
        })
        .eq("id", row.id);
      // Decrement affiliate stats
      await decrementAffiliateEarned(row.affiliate_id, row.commission_cents);
      cancelled++;
    } else if (row.status === "paid" || row.status === "clawback_applied") {
      // Create a clawback row (negative cents)
      const { error } = await supabase.from("affiliate_commissions").insert({
        affiliate_id: row.affiliate_id,
        referral_id: row.referral_id,
        transaction_id: row.transaction_id,
        deal_gross_cents: row.deal_gross_cents,
        commission_rate_bps: row.commission_rate_bps,
        commission_cents: -Math.abs(row.commission_cents),
        attributed_side: row.attributed_side,
        status: "clawback_pending",
        cancelled_reason: `clawback for ${row.id}: ${reason}`,
      });
      if (!error) {
        clawbacks++;
        // Notify the affiliate
        const { data: aff } = await supabase
          .from("affiliates")
          .select("*")
          .eq("id", row.affiliate_id)
          .maybeSingle();
        if (aff) {
          const { notifyClawback } = await import("./notify");
          await notifyClawback(aff as Affiliate, row.commission_cents, reason);
        }
      }
    }
  }

  return { cancelled, clawbacks_created: clawbacks };
}

async function decrementAffiliateEarned(
  affiliateId: string,
  amountCents: number,
): Promise<void> {
  const supabase = createServiceClient();
  const { data: aff } = await supabase
    .from("affiliates")
    .select("lifetime_earned_cents, lifetime_deals")
    .eq("id", affiliateId)
    .single();
  if (aff) {
    await supabase
      .from("affiliates")
      .update({
        lifetime_earned_cents: Math.max(
          0,
          (aff.lifetime_earned_cents ?? 0) - amountCents,
        ),
      })
      .eq("id", affiliateId);
  }
}
