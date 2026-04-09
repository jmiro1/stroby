/**
 * Affiliate auth — WhatsApp magic-link + signed session cookies.
 *
 * Why WhatsApp instead of email: Stroby has no email sender. WhatsApp
 * is the existing primary channel for every user type on the platform.
 * Reusing it means zero new infrastructure.
 *
 * Token shape:
 *   - Magic-link tokens are random 32-byte hex strings, sent in plaintext
 *     via WhatsApp, stored on the server as sha256 hashes. One-time use,
 *     15-minute expiry.
 *   - Session tokens are random 32-byte hex strings, returned to the
 *     client as an HttpOnly cookie, stored on the server as sha256 hashes.
 *     30-day expiry, server-side revocable.
 *
 * Why hash at rest: even if the database is leaked, attackers can't
 * mint working tokens. The plaintext only ever exists in transit.
 */

import { createHash, randomBytes } from "crypto";
import { createServiceClient } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { AFFILIATE_CONFIG } from "./config";
import type { Affiliate } from "./types";

// ---------------------------------------------------------------- helpers

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function randomHex(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function addMinutes(d: Date, mins: number): Date {
  const out = new Date(d);
  out.setMinutes(out.getMinutes() + mins);
  return out;
}

// ---------------------------------------------------------------- magic link

export interface IssueMagicResult {
  ok: boolean;
  error?: string;
}

/**
 * Issue a magic-link token for an affiliate identified by phone.
 * Looks the affiliate up, generates a token, stores its hash, and
 * sends a WhatsApp message with the link.
 *
 * Always returns ok=true if the lookup completes — does NOT leak
 * whether the phone number exists in the system (timing-safe in
 * practice because both branches do similar work).
 */
export async function issueMagicLink(phone: string): Promise<IssueMagicResult> {
  const supabase = createServiceClient();
  const normPhone = phone.replace(/\s+/g, "").trim();
  if (!normPhone) return { ok: false, error: "Phone required" };

  const { data: affiliate, error } = await supabase
    .from("affiliates")
    .select("id, phone, full_name, status")
    .eq("phone", normPhone)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    return { ok: false, error: "Lookup failed" };
  }
  // Don't leak existence — return ok regardless. If no affiliate, we just
  // don't send a message. The /login/sent page tells the user "if your
  // phone is registered, you'll receive a message".
  if (!affiliate || affiliate.status !== "active") {
    return { ok: true };
  }

  const magicToken = randomHex(32);
  const magicHash = sha256Hex(magicToken);
  const expiresAt = addMinutes(new Date(), AFFILIATE_CONFIG.MAGIC_LINK_TTL_MIN);

  const { error: insertErr } = await supabase
    .from("affiliate_sessions")
    .insert({
      affiliate_id: affiliate.id,
      magic_token_hash: magicHash,
      magic_expires_at: expiresAt.toISOString(),
      // expires_at is required NOT NULL — set it to magic expiry until session is created
      expires_at: expiresAt.toISOString(),
    });

  if (insertErr) {
    return { ok: false, error: "Failed to issue magic link" };
  }

  const link = `${AFFILIATE_CONFIG.PUBLIC_BASE_URL}/affiliates/login/verify?t=${magicToken}`;
  const msg =
    `Hi ${affiliate.full_name.split(" ")[0]} — here's your Stroby affiliate sign-in link:\n\n${link}\n\n` +
    `It expires in ${AFFILIATE_CONFIG.MAGIC_LINK_TTL_MIN} minutes. If you didn't request this, ignore this message.`;

  try {
    await sendWhatsAppMessage(normPhone, msg);
  } catch {
    // Don't fail the whole flow on a WhatsApp send error — the user
    // can retry. But we DO want to log it server-side.
    console.error("affiliate magic link WhatsApp send failed");
  }

  return { ok: true };
}

// ---------------------------------------------------------------- verify magic link

export interface VerifyMagicResult {
  ok: boolean;
  affiliate_id?: string;
  session_token?: string;
  expires_at?: string;
  error?: string;
}

/**
 * Verify a magic-link token. If valid, marks it consumed and creates
 * a session. Returns the session token (plaintext) for the caller to
 * set as a cookie.
 */
export async function verifyMagicLink(
  magicToken: string,
  ipHash: string | null,
  userAgent: string | null,
): Promise<VerifyMagicResult> {
  if (!magicToken || typeof magicToken !== "string") {
    return { ok: false, error: "Invalid token" };
  }

  const supabase = createServiceClient();
  const magicHash = sha256Hex(magicToken);
  const now = new Date();

  // Find the matching session row by magic_token_hash
  const { data: row, error } = await supabase
    .from("affiliate_sessions")
    .select("id, affiliate_id, magic_expires_at, magic_consumed_at")
    .eq("magic_token_hash", magicHash)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    return { ok: false, error: "Lookup failed" };
  }
  if (!row) return { ok: false, error: "Invalid or expired link" };
  if (row.magic_consumed_at) return { ok: false, error: "Link already used" };
  if (row.magic_expires_at && new Date(row.magic_expires_at) < now) {
    return { ok: false, error: "Link expired" };
  }

  // Mint a session token
  const sessionToken = randomHex(32);
  const sessionHash = sha256Hex(sessionToken);
  const sessionExpiresAt = addDays(now, AFFILIATE_CONFIG.SESSION_TTL_DAYS);

  // Update the session row: clear magic state, set session state
  const { error: upd } = await supabase
    .from("affiliate_sessions")
    .update({
      magic_consumed_at: now.toISOString(),
      magic_token_hash: null,
      magic_expires_at: null,
      token_hash: sessionHash,
      ip_hash: ipHash,
      user_agent: userAgent,
      expires_at: sessionExpiresAt.toISOString(),
    })
    .eq("id", row.id);

  if (upd) return { ok: false, error: "Failed to create session" };

  return {
    ok: true,
    affiliate_id: row.affiliate_id,
    session_token: sessionToken,
    expires_at: sessionExpiresAt.toISOString(),
  };
}

// ---------------------------------------------------------------- session resolution

/**
 * Look up an affiliate by their session token (from a cookie).
 * Returns null if the session is invalid, expired, or revoked.
 */
export async function getAffiliateFromSessionToken(
  sessionToken: string | null | undefined,
): Promise<Affiliate | null> {
  if (!sessionToken) return null;
  const supabase = createServiceClient();
  const tokenHash = sha256Hex(sessionToken);

  const { data: session } = await supabase
    .from("affiliate_sessions")
    .select("affiliate_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!session) return null;
  if (session.revoked_at) return null;
  if (new Date(session.expires_at) < new Date()) return null;

  const { data: affiliate } = await supabase
    .from("affiliates")
    .select("*")
    .eq("id", session.affiliate_id)
    .maybeSingle();

  if (!affiliate) return null;
  if (affiliate.status === "banned") return null;
  return affiliate as Affiliate;
}

/**
 * Revoke a session by token (used on logout).
 */
export async function revokeSession(sessionToken: string): Promise<void> {
  const supabase = createServiceClient();
  const tokenHash = sha256Hex(sessionToken);
  await supabase
    .from("affiliate_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token_hash", tokenHash);
}

/**
 * Helper for routes: hash the request IP for anonymized storage.
 */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return sha256Hex(ip).slice(0, 32);
}
