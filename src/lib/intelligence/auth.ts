/**
 * Shared auth helper for intelligence API routes.
 * Uses constant-time comparison to prevent timing side-channel attacks.
 */
import crypto from "crypto";

export function verifyIntelligenceAuth(authHeader: string | null): boolean {
  const secret = process.env.INTELLIGENCE_API_SECRET;
  if (!secret) return false;

  const expected = `Bearer ${secret}`;
  const actual = authHeader || "";

  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
