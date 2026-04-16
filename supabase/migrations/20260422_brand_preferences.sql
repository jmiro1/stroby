-- ======================================================================
-- Brand preferences — outcome, creator type, and size preferences
-- ======================================================================
-- Lets brands express what they WANT from a partnership:
--   campaign_outcome: reach | engagement | conversions | credibility
--   preferred_creator_type: newsletter | youtube | instagram | podcast | any
--   preferred_creator_size: micro (<10k) | mid (10-100k) | macro (100k+) | any
--
-- Used by the matching engine to score outcome fit and filter by
-- creator type / size preference.
-- ======================================================================

BEGIN;

ALTER TABLE business_profiles_all
  ADD COLUMN IF NOT EXISTS campaign_outcome TEXT,
  ADD COLUMN IF NOT EXISTS preferred_creator_type TEXT DEFAULT 'any',
  ADD COLUMN IF NOT EXISTS preferred_creator_size TEXT DEFAULT 'any';

-- Soft constraints (allow NULL for backward compat with existing rows)
ALTER TABLE business_profiles_all
  ADD CONSTRAINT business_profiles_campaign_outcome_check
  CHECK (campaign_outcome IS NULL OR campaign_outcome IN (
    'reach', 'engagement', 'conversions', 'credibility'
  ));

ALTER TABLE business_profiles_all
  ADD CONSTRAINT business_profiles_preferred_creator_type_check
  CHECK (preferred_creator_type IS NULL OR preferred_creator_type IN (
    'newsletter', 'youtube', 'instagram', 'tiktok', 'podcast', 'linkedin', 'twitter', 'any'
  ));

ALTER TABLE business_profiles_all
  ADD CONSTRAINT business_profiles_preferred_creator_size_check
  CHECK (preferred_creator_size IS NULL OR preferred_creator_size IN (
    'micro', 'mid', 'macro', 'any'
  ));

COMMIT;
