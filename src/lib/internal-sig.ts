import crypto from "crypto";

// Shared secret for signing internal server-to-server requests.
// Reuses CRON_SECRET so we don't introduce yet another env var — same trust
// boundary (both are server-only, set in Vercel).
function getSecret(): string {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Error("CRON_SECRET is not set — required for internal request signing");
  }
  return secret;
}

// Sign an arbitrary string body. Caller is responsible for stable serialization.
export function signInternalBody(body: string): string {
  return crypto.createHmac("sha256", getSecret()).update(body).digest("hex");
}

// Constant-time verification. Returns false on missing/short/mismatched sig.
export function verifyInternalBody(body: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = signInternalBody(body);
  if (signature.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export const INTERNAL_SIG_HEADER = "x-stroby-internal-sig";
