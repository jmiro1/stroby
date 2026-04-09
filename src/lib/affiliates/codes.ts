/**
 * Referral code generation.
 *
 * 8-character uppercase, alphanumeric, no confusable characters
 * (no 0/O, 1/I/L, etc.). Roughly 28^8 ≈ 3.8e11 possible codes —
 * collision probability is negligible at any realistic scale, but
 * the generator retries on collision anyway as a safety net.
 */

import { createServiceClient } from "@/lib/supabase";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 30 chars: removed I, L, O, 0, 1
const CODE_LENGTH = 8;
const MAX_RETRIES = 8;

function randomCode(): string {
  let out = "";
  // crypto.getRandomValues is available in Node 19+ and the Edge runtime
  const buf = new Uint32Array(CODE_LENGTH);
  crypto.getRandomValues(buf);
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[buf[i] % ALPHABET.length];
  }
  return out;
}

/**
 * Generate a referral code that does not collide with any existing one.
 * Throws if it can't find a free code after MAX_RETRIES attempts (which
 * would indicate a serious underlying problem, not collision).
 */
export async function generateUniqueReferralCode(): Promise<string> {
  const supabase = createServiceClient();
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const code = randomCode();
    const { data, error } = await supabase
      .from("affiliates")
      .select("id")
      .eq("referral_code", code)
      .maybeSingle();
    if (error && error.code !== "PGRST116") {
      throw new Error(`code lookup failed: ${error.message}`);
    }
    if (!data) return code;
  }
  throw new Error(
    `failed to generate unique referral code after ${MAX_RETRIES} attempts`,
  );
}

/**
 * Validate the shape of an inbound referral code (e.g. from a URL or
 * a signup form). Does NOT check existence — that's a separate query.
 */
export function isValidCodeShape(code: string): boolean {
  if (!code || typeof code !== "string") return false;
  if (code.length !== CODE_LENGTH) return false;
  for (const ch of code) {
    if (!ALPHABET.includes(ch)) return false;
  }
  return true;
}

/**
 * Normalize a code from arbitrary input (uppercase, strip whitespace).
 */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/\s+/g, "");
}
