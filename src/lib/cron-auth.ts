/**
 * Verify the Authorization header on internal cron routes.
 *
 * Replaces the older `if (process.env.CRON_SECRET && header !== \`Bearer …\`)`
 * pattern, which was fail-OPEN: an unset `CRON_SECRET` environment
 * variable bypassed the check entirely. This helper is fail-CLOSED — a
 * missing secret in production rejects the request with 503.
 *
 * Comparison is constant-time via crypto.timingSafeEqual to prevent
 * timing side-channel attacks (matches the pattern in webhooks/whatsapp
 * and lib/internal-sig.ts).
 */
import { timingSafeEqual } from "crypto";

export type CronAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

export function verifyCronAuth(authHeader: string | null): CronAuthResult {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      console.error("SECURITY: CRON_SECRET not set in production — rejecting cron call");
      return { ok: false, status: 503, error: "Server misconfigured" };
    }
    // In dev/test, allow unauthed calls so local runs don't need the env.
    return { ok: true };
  }

  const header = authHeader || "";
  if (!header.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const token = header.slice(7);

  // Length pre-check (timingSafeEqual throws on length mismatch)
  if (token.length !== expected.length) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  try {
    if (!timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
      return { ok: false, status: 401, error: "Unauthorized" };
    }
  } catch {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true };
}
