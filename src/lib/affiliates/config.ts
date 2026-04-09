/**
 * Affiliate program configuration.
 *
 * Single source of truth for every commission rate, window, and threshold.
 * All values are env-var driven so they can be changed in Vercel without
 * a code deploy. The defaults below match the locked-in design in
 * /Users/joaquimmiro/stroby/AFFILIATE_PRD.md.
 *
 * Per-affiliate overrides are supported via the `affiliates.custom_rate_bps`
 * column — if non-null, it overrides DEFAULT_COMMISSION_BPS for that affiliate.
 */

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export const AFFILIATE_CONFIG = {
  // ---- Commission math ----
  /** Stroby's gross take per deal in basis points. 2000 = 20% */
  PLATFORM_FEE_BPS: intEnv("STROBY_PLATFORM_FEE_BPS", 2000),
  /** Default affiliate commission rate. 1000 = 10% */
  DEFAULT_COMMISSION_BPS: intEnv("AFFILIATE_DEFAULT_BPS", 1000),
  /** Per-side rate when both sides have different affiliates. 500 = 5% each */
  SPLIT_COMMISSION_BPS: intEnv("AFFILIATE_SPLIT_BPS", 500),

  // ---- Time windows ----
  /** How long after a party signs up are deals still attribution-eligible */
  ATTRIBUTION_WINDOW_DAYS: intEnv("AFFILIATE_ATTRIBUTION_DAYS", 365),
  /** Cookie persistence for the /r/[code] redirect path */
  COOKIE_DAYS: intEnv("AFFILIATE_COOKIE_DAYS", 30),
  /** How long a manual intro stays pending before expiring */
  PENDING_INTRO_DAYS: intEnv("AFFILIATE_PENDING_INTRO_DAYS", 90),
  /** Days commission stays in `pending` before flipping to `payable` */
  HOLD_DAYS: intEnv("AFFILIATE_HOLD_DAYS", 30),
  /** Days after payout during which a refund triggers a clawback */
  CLAWBACK_DAYS: intEnv("AFFILIATE_CLAWBACK_DAYS", 60),

  // ---- Money thresholds (cents) ----
  /** Minimum payout amount; below this, balance rolls forward */
  MIN_PAYOUT_CENTS: intEnv("AFFILIATE_MIN_PAYOUT_CENTS", 5000),
  /** Minimum deal size eligible for any commission */
  MIN_DEAL_CENTS: intEnv("AFFILIATE_MIN_DEAL_CENTS", 20000),

  // ---- Auth / sessions ----
  /** HMAC secret for magic-link tokens and session cookies */
  SESSION_SECRET: process.env.AFFILIATE_SESSION_SECRET ?? "",
  /** Magic-link expiry in minutes */
  MAGIC_LINK_TTL_MIN: intEnv("AFFILIATE_MAGIC_TTL_MIN", 15),
  /** Session cookie lifetime in days */
  SESSION_TTL_DAYS: intEnv("AFFILIATE_SESSION_TTL_DAYS", 30),
  /** Cookie names */
  REFERRAL_COOKIE_NAME: "stroby_aff",
  SESSION_COOKIE_NAME: "stroby_aff_session",

  // ---- Operational ----
  /** If true, applications skip the manual approval step */
  AUTO_APPROVE: boolEnv("AFFILIATE_AUTO_APPROVE", false),
  /** Phone number to notify on new applications (admin) */
  ADMIN_PHONE: process.env.AFFILIATE_ADMIN_PHONE ?? "",
  /** Public base URL for building referral links */
  PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? "https://stroby.ai",
} as const;

/**
 * Compute commission cents from gross + rate (basis points).
 * Floors to integer cents — affiliates never get fractional cent rounding errors.
 */
export function computeCommissionCents(
  grossCents: number,
  rateBps: number,
): number {
  return Math.floor((grossCents * rateBps) / 10000);
}

/**
 * Resolve the rate for a given affiliate. Per-affiliate override wins
 * over the global default.
 */
export function resolveRateBps(custom_rate_bps: number | null | undefined): number {
  if (custom_rate_bps && custom_rate_bps > 0) return custom_rate_bps;
  return AFFILIATE_CONFIG.DEFAULT_COMMISSION_BPS;
}

/**
 * Sanity-check the configuration at startup. Throws if anything is broken.
 * Call from any entry point that touches affiliate code.
 */
export function assertConfigValid(): void {
  if (!AFFILIATE_CONFIG.SESSION_SECRET || AFFILIATE_CONFIG.SESSION_SECRET.length < 32) {
    throw new Error(
      "AFFILIATE_SESSION_SECRET env var must be set to a random string of at least 32 chars",
    );
  }
  if (AFFILIATE_CONFIG.DEFAULT_COMMISSION_BPS > AFFILIATE_CONFIG.PLATFORM_FEE_BPS) {
    throw new Error(
      `AFFILIATE_DEFAULT_BPS (${AFFILIATE_CONFIG.DEFAULT_COMMISSION_BPS}) ` +
      `cannot exceed STROBY_PLATFORM_FEE_BPS (${AFFILIATE_CONFIG.PLATFORM_FEE_BPS}) — ` +
      `Stroby would lose money on every affiliate-touched deal.`,
    );
  }
  if (AFFILIATE_CONFIG.SPLIT_COMMISSION_BPS * 2 > AFFILIATE_CONFIG.PLATFORM_FEE_BPS) {
    throw new Error(
      `2 × AFFILIATE_SPLIT_BPS exceeds STROBY_PLATFORM_FEE_BPS — both-side splits would underwater Stroby.`,
    );
  }
}
