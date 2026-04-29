-- ======================================================================
-- Multi-platform matching, Phase A — quantitative fields on other_profiles
-- ======================================================================
-- other_profiles is the storage for non-newsletter creators (YouTubers,
-- podcasters, IG/TikTok/LinkedIn/Twitter). Today the table has rich
-- identity fields (name, role, organization, niche, objectives,
-- can_offer) but no quantitative metrics — so the matching engine had
-- nothing to score on.
--
-- This migration adds the universal fields the matching engine reads.
-- Per-platform meaning is layered on top in lib/intelligence/matching.ts:
--   - audience_reach: subscribers / followers / listeners / viewers
--     (semantically platform-specific; matcher normalizes to monthly
--     impressions via lib/intelligence/matching.effectiveMonthlyImpressions)
--   - engagement_rate: open rate / view rate / completion rate / like rate
--     (matcher applies per-platform thresholds)
--   - content_intelligence: same JSONB shape Echo profiler produces; for
--     non-newsletter creators it'll be sparse in v1 (no per-platform
--     profiler yet — see TODO.md Maybe/Explore Later)
--   - profile_embedding: 1536-d Voyage embedding from name+niche+
--     description+role+can_offer
--
-- Zero rows in other_profiles today, so no backfill concerns.
-- ======================================================================

BEGIN;

ALTER TABLE public.other_profiles
  ADD COLUMN IF NOT EXISTS platform TEXT
    CHECK (platform IS NULL OR platform IN
      ('newsletter','youtube','podcast','instagram','tiktok','linkedin','twitter','blog','other'));

ALTER TABLE public.other_profiles ADD COLUMN IF NOT EXISTS audience_reach           INTEGER;
ALTER TABLE public.other_profiles ADD COLUMN IF NOT EXISTS engagement_rate          NUMERIC(5,4);
ALTER TABLE public.other_profiles ADD COLUMN IF NOT EXISTS avg_open_rate            NUMERIC(5,4);  -- newsletter-on-other path
ALTER TABLE public.other_profiles ADD COLUMN IF NOT EXISTS price_per_placement      INTEGER;       -- cents
ALTER TABLE public.other_profiles ADD COLUMN IF NOT EXISTS content_intelligence     JSONB;
ALTER TABLE public.other_profiles ADD COLUMN IF NOT EXISTS profile_embedding        vector(1536);
ALTER TABLE public.other_profiles ADD COLUMN IF NOT EXISTS match_eligible           BOOLEAN  DEFAULT false;
ALTER TABLE public.other_profiles ADD COLUMN IF NOT EXISTS match_eligibility_score  SMALLINT DEFAULT 0;
ALTER TABLE public.other_profiles ADD COLUMN IF NOT EXISTS open_to_inquiries        BOOLEAN  DEFAULT false;

-- Helpful when the matching engine fans out per-platform queries
CREATE INDEX IF NOT EXISTS idx_other_profiles_platform ON public.other_profiles (platform) WHERE platform IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_other_match_eligible    ON public.other_profiles (match_eligible) WHERE match_eligible = true;

COMMIT;
