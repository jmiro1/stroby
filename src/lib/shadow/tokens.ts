/**
 * Claim-token signing + verification.
 *
 * Claim tokens are short-lived HMAC-signed blobs that embed:
 *   - profile_id (UUID)
 *   - profile_type ("brand" | "creator")
 *   - expires_at (ms since epoch)
 *
 * Format: `v1.<base64url_payload>.<base64url_hmac>`.
 * Signed with CLAIM_TOKEN_SECRET (32-byte hex, never exposed to clients).
 *
 * Verification is constant-time (crypto.timingSafeEqual) and rejects
 * expired tokens. Used by the /api/shadow/claim route + /claim/[token]
 * page to authenticate a one-time promotion from shadow → whatsapp_active.
 */
import { createHmac, timingSafeEqual } from "crypto";

const DEFAULT_TTL_DAYS = 30;
const VERSION = "v1";

export interface ClaimTokenPayload {
  profile_id: string;
  profile_type: "brand" | "creator";
  expires_at: number; // ms since epoch
}

function getSecret(): string {
  const s = process.env.CLAIM_TOKEN_SECRET;
  if (!s || s.length < 32) {
    throw new Error("CLAIM_TOKEN_SECRET not set or too short");
  }
  return s;
}

function b64urlEncode(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(input: string): Buffer {
  const padding = (4 - (input.length % 4)) % 4;
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padding);
  return Buffer.from(padded, "base64");
}

export function signClaimToken(
  profileId: string,
  profileType: "brand" | "creator",
  ttlDays: number = DEFAULT_TTL_DAYS
): string {
  if (!/^[a-f0-9-]{36}$/i.test(profileId)) {
    throw new Error("signClaimToken: invalid profile_id (expected UUID)");
  }
  const payload: ClaimTokenPayload = {
    profile_id: profileId,
    profile_type: profileType,
    expires_at: Date.now() + ttlDays * 24 * 60 * 60 * 1000,
  };
  const payloadEncoded = b64urlEncode(JSON.stringify(payload));
  const sig = createHmac("sha256", getSecret()).update(`${VERSION}.${payloadEncoded}`).digest();
  return `${VERSION}.${payloadEncoded}.${b64urlEncode(sig)}`;
}

export interface VerifyResult {
  ok: boolean;
  payload?: ClaimTokenPayload;
  error?: "malformed" | "bad_signature" | "expired" | "wrong_version";
}

export function verifyClaimToken(token: string): VerifyResult {
  if (!token || typeof token !== "string") {
    return { ok: false, error: "malformed" };
  }
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, error: "malformed" };
  const [version, payloadEncoded, sigEncoded] = parts;
  if (version !== VERSION) return { ok: false, error: "wrong_version" };

  let expectedSig: Buffer;
  let providedSig: Buffer;
  try {
    expectedSig = createHmac("sha256", getSecret()).update(`${version}.${payloadEncoded}`).digest();
    providedSig = b64urlDecode(sigEncoded);
  } catch {
    return { ok: false, error: "malformed" };
  }

  if (expectedSig.length !== providedSig.length) {
    return { ok: false, error: "bad_signature" };
  }
  if (!timingSafeEqual(expectedSig, providedSig)) {
    return { ok: false, error: "bad_signature" };
  }

  let payload: ClaimTokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(payloadEncoded).toString("utf8"));
  } catch {
    return { ok: false, error: "malformed" };
  }

  if (!payload.profile_id || !payload.profile_type || !payload.expires_at) {
    return { ok: false, error: "malformed" };
  }
  if (payload.profile_type !== "brand" && payload.profile_type !== "creator") {
    return { ok: false, error: "malformed" };
  }
  if (!/^[a-f0-9-]{36}$/i.test(payload.profile_id)) {
    return { ok: false, error: "malformed" };
  }
  if (Date.now() > payload.expires_at) {
    return { ok: false, error: "expired" };
  }

  return { ok: true, payload };
}
