/**
 * Shared auth helper for intelligence API routes.
 * Uses constant-time comparison to prevent timing side-channel attacks.
 */

export function verifyIntelligenceAuth(authHeader: string | null): boolean {
  const secret = process.env.INTELLIGENCE_API_SECRET;
  if (!secret) {
    console.error("INTELLIGENCE_API_SECRET not set");
    return false;
  }

  const actual = authHeader || "";
  if (!actual.startsWith("Bearer ")) return false;

  const token = actual.slice(7);
  if (token.length !== secret.length) return false;

  // Constant-time comparison
  const crypto = require("crypto");
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secret));
}
