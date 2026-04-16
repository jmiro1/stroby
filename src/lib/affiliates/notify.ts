/**
 * Affiliate WhatsApp notifications.
 *
 * Thin wrappers around sendWhatsAppMessage() with affiliate-specific
 * copy. All notifications go via WhatsApp because Stroby has no email
 * sender (see AFFILIATE_PRD.md §D13).
 *
 * Failures are logged but never throw — notifications are best-effort.
 * The system continues to work if a single message fails; the affiliate
 * just won't get the heads-up.
 */

import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { AFFILIATE_CONFIG } from "./config";
import type { Affiliate } from "./types";

function fmtUsd(cents: number): string {
  const dollars = Math.abs(cents) / 100;
  return `$${dollars.toFixed(2)}`;
}

function firstName(fullName: string): string {
  return fullName.split(/\s+/)[0] || fullName;
}

async function safeSend(phone: string, body: string, label: string): Promise<void> {
  try {
    await sendWhatsAppMessage(phone, body);
  } catch (e) {
    console.error(`affiliate notify [${label}] failed:`, e);
  }
}

// ---------------------------------------------------------------- application lifecycle

export async function notifyApplicationApproved(affiliate: Affiliate): Promise<void> {
  const link = `${AFFILIATE_CONFIG.PUBLIC_BASE_URL}/r/${affiliate.referral_code}`;
  const dashboard = `${AFFILIATE_CONFIG.PUBLIC_BASE_URL}/affiliates/login`;
  const body =
    `🎉 Welcome to the Stroby affiliate program, ${firstName(affiliate.full_name)}!\n\n` +
    `Your application is approved.\n\n` +
    `Your personal referral link:\n${link}\n\n` +
    `Your code: ${affiliate.referral_code}\n\n` +
    `Sign in to your dashboard:\n${dashboard}\n\n` +
    `You earn up to 10% of every deal involving creators or brands you introduce. ` +
    `Reply to this message anytime if you have questions.`;
  await safeSend(affiliate.phone, body, "approved");
}

export async function notifyApplicationRejected(
  affiliate: Affiliate,
  reason: string,
): Promise<void> {
  const body =
    `Hi ${firstName(affiliate.full_name)} — thanks for applying to the Stroby affiliate program. ` +
    `Unfortunately we're unable to approve your application at this time.\n\n` +
    (reason ? `Reason: ${reason}\n\n` : "") +
    `If you'd like to discuss, reply to this message.`;
  await safeSend(affiliate.phone, body, "rejected");
}

export async function notifyAdminNewApplication(
  affiliate: Affiliate,
): Promise<void> {
  if (!AFFILIATE_CONFIG.ADMIN_PHONE) return;
  const body =
    `📥 New affiliate application:\n\n` +
    `Name: ${affiliate.full_name}\n` +
    `Email: ${affiliate.email}\n` +
    `Phone: ${affiliate.phone}\n` +
    `Network: ${affiliate.network_description ?? "(not provided)"}\n\n` +
    `Review at ${AFFILIATE_CONFIG.PUBLIC_BASE_URL}/admin/affiliates`;
  await safeSend(AFFILIATE_CONFIG.ADMIN_PHONE, body, "admin_new_app");
}

// ---------------------------------------------------------------- commission lifecycle

export async function notifyCommissionEarned(
  affiliate: Affiliate,
  commissionCents: number,
  publicationName: string | null,
): Promise<void> {
  const body =
    `💰 You earned ${fmtUsd(commissionCents)} commission` +
    (publicationName ? ` on a deal with ${publicationName}` : "") +
    `.\n\n` +
    `It will be available for payout after the 30-day hold period.\n\n` +
    `View details: ${AFFILIATE_CONFIG.PUBLIC_BASE_URL}/affiliates/dashboard/commissions`;
  await safeSend(affiliate.phone, body, "commission_earned");
}

export async function notifyClawback(
  affiliate: Affiliate,
  clawbackCents: number,
  reason: string,
): Promise<void> {
  const body =
    `⚠️ Heads up — ${fmtUsd(clawbackCents)} was clawed back from your commissions.\n\n` +
    `Reason: ${reason}\n\n` +
    `It will be netted against your next payout. You will never go negative — ` +
    `clawbacks queue and wait for future earnings if needed.\n\n` +
    `View details: ${AFFILIATE_CONFIG.PUBLIC_BASE_URL}/affiliates/dashboard/commissions`;
  await safeSend(affiliate.phone, body, "clawback");
}

// ---------------------------------------------------------------- payout lifecycle

export async function notifyPayoutSent(
  affiliate: Affiliate,
  amountCents: number,
): Promise<void> {
  const body =
    `✅ Your payout of ${fmtUsd(amountCents)} has been sent to your connected Stripe account.\n\n` +
    `Funds typically arrive within 1-2 business days.\n\n` +
    `View details: ${AFFILIATE_CONFIG.PUBLIC_BASE_URL}/affiliates/dashboard/payouts`;
  await safeSend(affiliate.phone, body, "payout_sent");
}

export async function notifyPayoutRolledForward(
  affiliate: Affiliate,
  pendingCents: number,
): Promise<void> {
  const body =
    `Heads up — your current balance of ${fmtUsd(pendingCents)} is below the ` +
    `${fmtUsd(AFFILIATE_CONFIG.MIN_PAYOUT_CENTS)} minimum payout threshold, so ` +
    `it's rolling forward to next month's cycle.`;
  await safeSend(affiliate.phone, body, "payout_rolled");
}
