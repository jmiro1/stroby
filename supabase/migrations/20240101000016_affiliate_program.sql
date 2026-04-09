-- ============================================================
-- Stroby Affiliate Program — Phase 1 schema
-- ============================================================
-- See AFFILIATE_PRD.md for the canonical spec. Do not modify these
-- tables without first updating the PRD.
--
-- Tables created:
--   1. affiliates
--   2. affiliate_referrals
--   3. affiliate_commissions  (FK to payouts added after table 4)
--   4. affiliate_payouts
--   5. affiliate_sessions
--
-- Existing tables modified (adds nullable affiliate_id FK only):
--   - newsletter_profiles
--   - business_profiles
--   - other_profiles
-- ============================================================


-- ============================================================
-- 1. affiliates
-- ============================================================
CREATE TABLE affiliates (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  email                  TEXT NOT NULL UNIQUE,
  full_name              TEXT NOT NULL,
  display_name           TEXT,                                  -- optional public alias
  phone                  TEXT NOT NULL,                         -- required for WhatsApp magic-link auth
  bio                    TEXT,                                  -- 1-2 line self-description
  network_description    TEXT,                                  -- "tell us about your network"

  -- Referral mechanics
  referral_code          TEXT NOT NULL UNIQUE,                  -- 8-char uppercase, no confusable chars

  -- Stripe Connect (Phase 2 — populated when affiliate completes onboarding)
  stripe_account_id      TEXT,
  stripe_payouts_enabled BOOLEAN NOT NULL DEFAULT false,

  -- Linked existing accounts (an affiliate can also be a creator/business/other)
  newsletter_profile_id  UUID REFERENCES newsletter_profiles(id) ON DELETE SET NULL,
  business_profile_id    UUID REFERENCES business_profiles(id)   ON DELETE SET NULL,
  other_profile_id       UUID REFERENCES other_profiles(id)      ON DELETE SET NULL,

  -- Status
  status                 TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'active', 'suspended', 'banned')),
  suspended_reason       TEXT,

  -- Per-affiliate rate override (null = use AFFILIATE_DEFAULT_BPS env var)
  custom_rate_bps        INTEGER,

  -- Tier (only `standard` is used in MVP; silver/gold reserved for Phase 3)
  tier                   TEXT NOT NULL DEFAULT 'standard'
                           CHECK (tier IN ('standard', 'silver', 'gold')),

  -- Lifetime stats (denormalized for fast dashboard reads, updated on commission events)
  lifetime_referrals     INTEGER NOT NULL DEFAULT 0,
  lifetime_deals         INTEGER NOT NULL DEFAULT 0,
  lifetime_earned_cents  INTEGER NOT NULL DEFAULT 0,             -- gross earned (before clawbacks)
  lifetime_paid_cents    INTEGER NOT NULL DEFAULT 0,             -- net paid out

  -- Audit
  approved_at            TIMESTAMPTZ,
  approved_by_admin      TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_affiliates_status ON affiliates (status);
CREATE INDEX idx_affiliates_code   ON affiliates (referral_code);
CREATE INDEX idx_affiliates_phone  ON affiliates (phone);
CREATE INDEX idx_affiliates_email  ON affiliates (lower(email));

CREATE TRIGGER set_affiliates_updated_at
  BEFORE UPDATE ON affiliates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 2. affiliate_referrals
-- ============================================================
-- One row per referral the affiliate has made. The referral can be
-- in `pending` state (manual intro form, no signup yet) or bound to
-- an actual profile FK once the introduced party signs up.
CREATE TABLE affiliate_referrals (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id           UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,

  -- Bound target (exactly one of the profile FKs OR the pending fields will be set)
  newsletter_profile_id  UUID REFERENCES newsletter_profiles(id) ON DELETE SET NULL,
  business_profile_id    UUID REFERENCES business_profiles(id)   ON DELETE SET NULL,
  other_profile_id       UUID REFERENCES other_profiles(id)      ON DELETE SET NULL,

  -- Pending state (manual intro hasn't signed up yet)
  pending_email          TEXT,
  pending_name           TEXT,
  pending_role           TEXT CHECK (pending_role IN ('newsletter', 'business', 'other')),
  pending_intro_note     TEXT,                                  -- affiliate's note about the intro

  -- How the attribution happened
  attribution_method     TEXT NOT NULL CHECK (attribution_method IN
                           ('manual_intro', 'email_match', 'cookie',
                            'code_at_signup', 'admin_override')),
  attribution_metadata   JSONB,                                 -- {ip_hash, user_agent, utm, ...}

  -- Lifecycle
  status                 TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'signed_up', 'expired',
                                             'rejected_self_referral', 'admin_revoked')),
  signed_up_at           TIMESTAMPTZ,
  expires_at             TIMESTAMPTZ NOT NULL,                  -- 90 days from creation if pending

  -- Audit
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- At least one of the four target fields must be set
  CONSTRAINT one_referral_target CHECK (
    (newsletter_profile_id IS NOT NULL)::int +
    (business_profile_id   IS NOT NULL)::int +
    (other_profile_id      IS NOT NULL)::int +
    (pending_email         IS NOT NULL)::int >= 1
  )
);

CREATE INDEX idx_referrals_affiliate     ON affiliate_referrals (affiliate_id);
CREATE INDEX idx_referrals_pending_email ON affiliate_referrals (lower(pending_email))
  WHERE pending_email IS NOT NULL AND status = 'pending';
CREATE INDEX idx_referrals_status        ON affiliate_referrals (status);
CREATE INDEX idx_referrals_newsletter    ON affiliate_referrals (newsletter_profile_id) WHERE newsletter_profile_id IS NOT NULL;
CREATE INDEX idx_referrals_business      ON affiliate_referrals (business_profile_id)   WHERE business_profile_id   IS NOT NULL;
CREATE INDEX idx_referrals_other         ON affiliate_referrals (other_profile_id)      WHERE other_profile_id      IS NOT NULL;

CREATE TRIGGER set_referrals_updated_at
  BEFORE UPDATE ON affiliate_referrals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 3. affiliate_commissions
-- ============================================================
-- One row per commission earned. A single transaction can produce
-- 0, 1, or 2 commission rows (one per side if both sides are
-- affiliate-attributed).
--
-- Negative commission_cents represents a clawback row.
CREATE TABLE affiliate_commissions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id           UUID NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,
  referral_id            UUID NOT NULL REFERENCES affiliate_referrals(id) ON DELETE RESTRICT,
  transaction_id         UUID NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,

  -- Commission math (snapshot at time of earning, all in cents)
  deal_gross_cents       INTEGER NOT NULL,                      -- transactions.amount snapshot
  commission_rate_bps    INTEGER NOT NULL,                      -- snapshot (1000 = 10%)
  commission_cents       INTEGER NOT NULL,                      -- floor(gross * rate / 10000); negative for clawbacks

  -- Which side this affiliate brought (informational)
  attributed_side        TEXT NOT NULL CHECK (attributed_side IN ('brand', 'creator', 'both')),

  -- Lifecycle
  status                 TEXT NOT NULL DEFAULT 'pending' CHECK (status IN
                           ('pending',           -- inside hold window
                            'payable',           -- past hold, awaiting next payout
                            'paid',              -- transferred to affiliate's stripe account
                            'clawback_pending',  -- refund happened, debit waiting for next payout
                            'clawback_applied',  -- debit successfully applied
                            'cancelled')),       -- admin cancelled
  cancelled_reason       TEXT,
  payable_at             TIMESTAMPTZ,
  paid_at                TIMESTAMPTZ,
  payout_id              UUID,                                  -- FK added after affiliate_payouts table is created

  -- Audit
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_commissions_affiliate ON affiliate_commissions (affiliate_id);
CREATE INDEX idx_commissions_status    ON affiliate_commissions (status);
CREATE INDEX idx_commissions_payable   ON affiliate_commissions (payable_at) WHERE status = 'payable';
CREATE INDEX idx_commissions_txn       ON affiliate_commissions (transaction_id);

CREATE TRIGGER set_commissions_updated_at
  BEFORE UPDATE ON affiliate_commissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 4. affiliate_payouts
-- ============================================================
CREATE TABLE affiliate_payouts (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id           UUID NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,

  -- Payout details
  amount_cents           INTEGER NOT NULL,                      -- can be 0 if rolled forward; never negative (we hold)
  commission_count       INTEGER NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'queued' CHECK (status IN
                           ('queued', 'processing', 'paid', 'failed', 'reversed')),
  stripe_transfer_id     TEXT,
  failure_reason         TEXT,

  -- Period this payout covers
  period_start           DATE NOT NULL,
  period_end             DATE NOT NULL,

  -- Audit
  paid_at                TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payouts_affiliate ON affiliate_payouts (affiliate_id);
CREATE INDEX idx_payouts_status    ON affiliate_payouts (status);

CREATE TRIGGER set_payouts_updated_at
  BEFORE UPDATE ON affiliate_payouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Now that affiliate_payouts exists, link the FK from commissions
ALTER TABLE affiliate_commissions
  ADD CONSTRAINT fk_commissions_payout
  FOREIGN KEY (payout_id) REFERENCES affiliate_payouts(id) ON DELETE SET NULL;


-- ============================================================
-- 5. affiliate_sessions
-- ============================================================
-- Stores both magic-link tokens (one-time) and dashboard session tokens.
-- Magic-link state is set when issued, cleared when consumed. Session
-- state is set when the magic link is verified.
CREATE TABLE affiliate_sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id       UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,

  -- Session token (set after magic-link verification)
  token_hash         TEXT UNIQUE,                               -- sha256(opaque random session token)

  -- Magic link state (set when issuing, cleared when consumed)
  magic_token_hash   TEXT,                                      -- sha256(one-time magic token)
  magic_expires_at   TIMESTAMPTZ,
  magic_consumed_at  TIMESTAMPTZ,

  -- Session lifetime
  ip_hash            TEXT,
  user_agent         TEXT,
  expires_at         TIMESTAMPTZ NOT NULL,
  revoked_at         TIMESTAMPTZ,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_affiliate     ON affiliate_sessions (affiliate_id);
CREATE INDEX idx_sessions_token_hash    ON affiliate_sessions (token_hash) WHERE token_hash IS NOT NULL;
CREATE INDEX idx_sessions_magic_hash    ON affiliate_sessions (magic_token_hash) WHERE magic_token_hash IS NOT NULL;
CREATE INDEX idx_sessions_expires       ON affiliate_sessions (expires_at);


-- ============================================================
-- 6. Modifications to existing profile tables
-- ============================================================
-- Adds a nullable affiliate_id FK. The existing `referral_source`
-- text columns stay (still useful for generic UTM tracking).
-- The new `affiliate_id` is the canonical attribution anchor that
-- the commission engine reads.

ALTER TABLE newsletter_profiles
  ADD COLUMN affiliate_id UUID REFERENCES affiliates(id) ON DELETE SET NULL;

ALTER TABLE business_profiles
  ADD COLUMN affiliate_id UUID REFERENCES affiliates(id) ON DELETE SET NULL;

ALTER TABLE other_profiles
  ADD COLUMN affiliate_id UUID REFERENCES affiliates(id) ON DELETE SET NULL;

CREATE INDEX idx_newsletters_affiliate ON newsletter_profiles (affiliate_id) WHERE affiliate_id IS NOT NULL;
CREATE INDEX idx_businesses_affiliate  ON business_profiles   (affiliate_id) WHERE affiliate_id IS NOT NULL;
CREATE INDEX idx_other_affiliate       ON other_profiles      (affiliate_id) WHERE affiliate_id IS NOT NULL;


-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE affiliates             ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_referrals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_commissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_payouts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_sessions     ENABLE ROW LEVEL SECURITY;
