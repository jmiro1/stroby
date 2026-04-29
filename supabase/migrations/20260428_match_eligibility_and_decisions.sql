-- ======================================================================
-- Phase 1 — Match eligibility gate + decision logging
-- ======================================================================
-- Adds:
--   1. open_to_inquiries flag on newsletters (creator without a fixed price
--      can still be eligible if they explicitly opt in to inquiries)
--   2. match_eligible (boolean) + match_eligibility_score (0-100) on both
--      *_profiles_all tables, kept in sync via BEFORE INSERT/UPDATE triggers
--   3. match_decisions table — every proposed/declined/accepted/expired
--      step gets a row. Foundation for Phases 2-4 (mutual confirmation,
--      proactive push, memory in rerank).
--
-- The triggers are intentionally simple — they read columns from NEW only,
-- no subqueries, so writes stay fast. If the rubric changes, drop the
-- trigger and recreate; backfill UPDATEs the rows.
-- ======================================================================

BEGIN;

-- ── Step 1 ────────────────────────────────────────────────────────────
-- Creator-side: opt-in flag for creators who don't list a fixed price
ALTER TABLE public.newsletter_profiles_all
  ADD COLUMN IF NOT EXISTS open_to_inquiries BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.newsletter_profiles_all.open_to_inquiries IS
  'Creator has explicitly said they accept sponsor inquiries even without a public price. Counts toward match eligibility in lieu of price_per_placement.';


-- ── Step 2 ────────────────────────────────────────────────────────────
-- Add eligibility columns to both tables
ALTER TABLE public.newsletter_profiles_all
  ADD COLUMN IF NOT EXISTS match_eligible          BOOLEAN  DEFAULT false,
  ADD COLUMN IF NOT EXISTS match_eligibility_score SMALLINT DEFAULT 0;

ALTER TABLE public.business_profiles_all
  ADD COLUMN IF NOT EXISTS match_eligible          BOOLEAN  DEFAULT false,
  ADD COLUMN IF NOT EXISTS match_eligibility_score SMALLINT DEFAULT 0;

COMMENT ON COLUMN public.newsletter_profiles_all.match_eligible IS
  'True if this creator profile clears the match-quality gate. Maintained by trigger compute_creator_match_eligible.';
COMMENT ON COLUMN public.newsletter_profiles_all.match_eligibility_score IS
  '0-100 quality score. Required (gating) fields contribute 70 pts; bonus fields (verification, profiler, past sponsors) contribute up to 30. Used for tie-breaking among eligible creators.';

COMMENT ON COLUMN public.business_profiles_all.match_eligible IS
  'True if this brand profile clears the match-quality gate. Maintained by trigger compute_brand_match_eligible.';
COMMENT ON COLUMN public.business_profiles_all.match_eligibility_score IS
  '0-100 quality score (same shape as creator side).';


-- ── Step 3 ────────────────────────────────────────────────────────────
-- Creator eligibility computation
CREATE OR REPLACE FUNCTION public.compute_creator_match_eligible()
RETURNS TRIGGER AS $$
DECLARE
  has_reach    BOOLEAN := NEW.audience_reach IS NOT NULL AND NEW.audience_reach > 0;
  has_engage   BOOLEAN := (NEW.engagement_rate IS NOT NULL AND NEW.engagement_rate > 0)
                       OR (NEW.avg_open_rate    IS NOT NULL AND NEW.avg_open_rate    > 0);
  has_descr    BOOLEAN := NEW.description IS NOT NULL AND length(NEW.description) >= 100;
  has_price    BOOLEAN := NEW.price_per_placement IS NOT NULL OR COALESCE(NEW.open_to_inquiries, false) = true;
  has_embed    BOOLEAN := NEW.profile_embedding IS NOT NULL;
  bonus_score  INTEGER := 0;
BEGIN
  -- Bonus signals (up to 30 points total)
  -- email_verified is brand-side only; creators get bonus from intel + platform metrics + verification flag in raw_profile
  IF NEW.content_intelligence IS NOT NULL THEN bonus_score := bonus_score + 15; END IF;
  IF NEW.platform_metrics IS NOT NULL AND NEW.platform_metrics::text <> '{}' THEN bonus_score := bonus_score + 15; END IF;

  -- Required gates each contribute 14 points (5 × 14 = 70)
  NEW.match_eligibility_score := LEAST(100,
      (CASE WHEN has_reach  THEN 14 ELSE 0 END)
    + (CASE WHEN has_engage THEN 14 ELSE 0 END)
    + (CASE WHEN has_descr  THEN 14 ELSE 0 END)
    + (CASE WHEN has_price  THEN 14 ELSE 0 END)
    + (CASE WHEN has_embed  THEN 14 ELSE 0 END)
    + bonus_score
  );

  NEW.match_eligible := has_reach AND has_engage AND has_descr AND has_price AND has_embed;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_creator_match_eligible ON public.newsletter_profiles_all;
CREATE TRIGGER set_creator_match_eligible
  BEFORE INSERT OR UPDATE ON public.newsletter_profiles_all
  FOR EACH ROW EXECUTE FUNCTION public.compute_creator_match_eligible();


-- ── Step 4 ────────────────────────────────────────────────────────────
-- Brand eligibility computation
CREATE OR REPLACE FUNCTION public.compute_brand_match_eligible()
RETURNS TRIGGER AS $$
DECLARE
  has_product   BOOLEAN := NEW.product_description IS NOT NULL AND length(NEW.product_description) >= 50;
  has_target    BOOLEAN := NEW.target_customer     IS NOT NULL AND length(NEW.target_customer)     >= 50;
  has_budget    BOOLEAN := NEW.budget_range        IS NOT NULL AND length(NEW.budget_range)        >  0;
  has_outcome   BOOLEAN := NEW.campaign_outcome    IS NOT NULL;
  has_embed     BOOLEAN := NEW.profile_embedding   IS NOT NULL;
  bonus_score   INTEGER := 0;
BEGIN
  -- Bonus signals
  IF NEW.brand_intelligence IS NOT NULL THEN bonus_score := bonus_score + 15; END IF;
  IF NEW.preferences IS NOT NULL AND NEW.preferences ? 'past_newsletter_sponsors' THEN
    bonus_score := bonus_score + 15;
  END IF;

  NEW.match_eligibility_score := LEAST(100,
      (CASE WHEN has_product THEN 14 ELSE 0 END)
    + (CASE WHEN has_target  THEN 14 ELSE 0 END)
    + (CASE WHEN has_budget  THEN 14 ELSE 0 END)
    + (CASE WHEN has_outcome THEN 14 ELSE 0 END)
    + (CASE WHEN has_embed   THEN 14 ELSE 0 END)
    + bonus_score
  );

  NEW.match_eligible := has_product AND has_target AND has_budget AND has_outcome AND has_embed;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_brand_match_eligible ON public.business_profiles_all;
CREATE TRIGGER set_brand_match_eligible
  BEFORE INSERT OR UPDATE ON public.business_profiles_all
  FOR EACH ROW EXECUTE FUNCTION public.compute_brand_match_eligible();


-- ── Step 5 ────────────────────────────────────────────────────────────
-- Backfill existing rows by triggering a no-op UPDATE on each.
-- This fires the BEFORE UPDATE trigger which sets the new columns.
UPDATE public.newsletter_profiles_all SET id = id;
UPDATE public.business_profiles_all   SET id = id;


-- ── Step 6 ────────────────────────────────────────────────────────────
-- Indexes for the matching engine's filter
CREATE INDEX IF NOT EXISTS idx_newsletter_match_eligible
  ON public.newsletter_profiles_all(match_eligible)
  WHERE match_eligible = true;

CREATE INDEX IF NOT EXISTS idx_business_match_eligible
  ON public.business_profiles_all(match_eligible)
  WHERE match_eligible = true;


-- ── Step 7 ────────────────────────────────────────────────────────────
-- match_decisions table — foundation for Phases 2-4
CREATE TABLE IF NOT EXISTS public.match_decisions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      UUID NOT NULL REFERENCES public.newsletter_profiles_all(id) ON DELETE CASCADE,
  brand_id        UUID NOT NULL REFERENCES public.business_profiles_all(id)   ON DELETE CASCADE,
  decision        TEXT NOT NULL CHECK (decision IN (
    'proposed',         -- Stroby suggested this match
    'creator_yes',      -- creator said yes (interested in the intro)
    'creator_no',       -- creator declined
    'creator_maybe',    -- creator wants more info / later
    'brand_yes',
    'brand_no',
    'brand_maybe',
    'introduced',       -- both said yes; intro happened
    'no_response_3d',   -- timeout
    'expired'           -- generic terminal state
  )),
  decided_by      TEXT NOT NULL CHECK (decided_by IN ('creator','brand','system')),
  reason          TEXT,
  reason_summary  TEXT,                              -- LLM-extracted one-liner from free-text reason
  source          TEXT CHECK (source IN ('whatsapp','widget','email','manual','cron','api')),
  match_score     NUMERIC(5,4),                      -- score from the matching engine at proposal time
  metadata        JSONB DEFAULT '{}'::jsonb,         -- full match context, components, llm_reasoning
  decided_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_decisions_brand_recent
  ON public.match_decisions(brand_id, decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_match_decisions_creator_recent
  ON public.match_decisions(creator_id, decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_match_decisions_pair
  ON public.match_decisions(creator_id, brand_id, decided_at DESC);

COMMENT ON TABLE public.match_decisions IS
  'Every proposed, accepted, declined, or expired match between a creator and a brand. Foundation for proactive push (Phase 3), memory in rerank (Phase 4), and the implicit graph (Phase 5).';

-- RLS — service role only for now (server writes everything)
ALTER TABLE public.match_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "match_decisions_service_only" ON public.match_decisions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
