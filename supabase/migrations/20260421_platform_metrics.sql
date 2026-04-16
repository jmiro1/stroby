-- ======================================================================
-- Platform metrics — universal creator metrics across all platforms
-- ======================================================================
-- Expands the platform enum beyond email newsletters to include YouTube,
-- Instagram, TikTok, podcast, LinkedIn, Twitter/X, and blog.
--
-- Adds three columns:
--   audience_reach   — headline number (subs/followers/downloads)
--   engagement_rate  — universal interaction ratio (0.0000–1.0000)
--   platform_metrics — JSONB for platform-specific depth
--
-- Backfills existing newsletter rows from subscriber_count + open/ctr.
-- The old columns (subscriber_count, avg_open_rate, avg_ctr) stay for
-- backward compat — they're still valid for newsletters. New code should
-- read/write audience_reach + engagement_rate + platform_metrics instead.
-- ======================================================================

BEGIN;

-- ── Step 0: Normalize non-conforming platform values ──────────────────
-- Some rows have free-text platform values from early onboarding (e.g.
-- 'Substack + own site'). Normalize to the closest enum value.
UPDATE newsletter_profiles_all
SET platform = 'substack'
WHERE platform IS NOT NULL
  AND platform NOT IN ('beehiiv','substack','convertkit','mailchimp','other')
  AND lower(platform) LIKE '%substack%';

UPDATE newsletter_profiles_all
SET platform = 'other'
WHERE platform IS NOT NULL
  AND platform NOT IN ('beehiiv','substack','convertkit','mailchimp','other');

-- ── Step 1: Expand platform enum ──────────────────────────────────────
ALTER TABLE newsletter_profiles_all
  DROP CONSTRAINT IF EXISTS newsletter_profiles_platform_check;

ALTER TABLE newsletter_profiles_all
  ADD CONSTRAINT newsletter_profiles_platform_check
  CHECK (platform IS NULL OR platform IN (
    'beehiiv', 'substack', 'convertkit', 'mailchimp',
    'youtube', 'instagram', 'tiktok', 'podcast',
    'linkedin', 'twitter', 'blog', 'other'
  ));

-- ── Step 2: Universal metric columns ──────────────────────────────────
ALTER TABLE newsletter_profiles_all
  ADD COLUMN IF NOT EXISTS audience_reach    INTEGER,
  ADD COLUMN IF NOT EXISTS engagement_rate   DECIMAL(5,4),
  ADD COLUMN IF NOT EXISTS platform_metrics  JSONB DEFAULT '{}';

-- ── Step 3: Backfill existing newsletter rows ─────────────────────────
UPDATE newsletter_profiles_all
SET
  audience_reach = subscriber_count,
  engagement_rate = avg_open_rate,
  platform_metrics = jsonb_build_object(
    'subscriber_count', subscriber_count,
    'open_rate', avg_open_rate,
    'ctr', avg_ctr
  )
WHERE subscriber_count IS NOT NULL
  AND audience_reach IS NULL;

-- ── Step 4: Index on audience_reach for ranking queries ───────────────
CREATE INDEX IF NOT EXISTS newsletter_profiles_all_audience_reach_idx
  ON newsletter_profiles_all(audience_reach)
  WHERE audience_reach IS NOT NULL;

COMMIT;
