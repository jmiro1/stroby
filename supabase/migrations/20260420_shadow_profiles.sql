-- ======================================================================
-- Shadow Profiles migration
-- ======================================================================
-- Lets scraped creator/brand rows live in the product DB as 'shadow' rows,
-- invisible to the app but visible to the matching engine, with a claim
-- flow that promotes them atomically when they sign up.
--
-- Full architecture in /SHADOW_PROFILES_PLAN.md.
-- Down-migration in /supabase/migrations/20260415_shadow_profiles_down.sql.
--
-- STEP 0 makes an in-DB snapshot of affected tables before doing anything.
-- If something goes wrong post-migration and we need to restore, the
-- *_backup_20260415 tables are a last-resort recovery path (alongside
-- the pg_dump at ~/.stroby_backups/).
-- ======================================================================

BEGIN;

-- ── Step 0 ────────────────────────────────────────────────────────────
-- Full-row in-DB snapshot BEFORE we touch anything.
CREATE TABLE IF NOT EXISTS business_profiles_backup_20260415 AS
  SELECT * FROM public.business_profiles;

CREATE TABLE IF NOT EXISTS newsletter_profiles_backup_20260415 AS
  SELECT * FROM public.newsletter_profiles;

-- ── Step 1 ────────────────────────────────────────────────────────────
-- Relax the onboarding_status check to allow 'shadow'. Preserves all
-- existing allowed values so no real rows become invalid.
ALTER TABLE public.business_profiles
  DROP CONSTRAINT IF EXISTS business_profiles_onboarding_status_check;
ALTER TABLE public.business_profiles
  ADD CONSTRAINT business_profiles_onboarding_status_check
    CHECK (onboarding_status IN (
      'started', 'widget_complete', 'whatsapp_active',
      'fully_onboarded', 'shadow'
    ));

ALTER TABLE public.newsletter_profiles
  DROP CONSTRAINT IF EXISTS newsletter_profiles_onboarding_status_check;
ALTER TABLE public.newsletter_profiles
  ADD CONSTRAINT newsletter_profiles_onboarding_status_check
    CHECK (onboarding_status IN (
      'started', 'widget_complete', 'whatsapp_active',
      'verified', 'stripe_connected', 'fully_onboarded', 'shadow'
    ));

-- ── Step 2 ────────────────────────────────────────────────────────────
-- Add the two shadow-profile columns to both tables. Additive; no data
-- change for existing rows (NULL fills).
ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS shadow_source text,
  ADD COLUMN IF NOT EXISTS claimed_at    timestamptz;

ALTER TABLE public.newsletter_profiles
  ADD COLUMN IF NOT EXISTS shadow_source text,
  ADD COLUMN IF NOT EXISTS claimed_at    timestamptz;

-- ── Step 3 ────────────────────────────────────────────────────────────
-- Rename the physical tables. The names business_profiles / newsletter_profiles
-- become VIEWS in step 4, so existing app queries keep working unchanged.
ALTER TABLE public.business_profiles   RENAME TO business_profiles_all;
ALTER TABLE public.newsletter_profiles RENAME TO newsletter_profiles_all;

-- ── Step 4 ────────────────────────────────────────────────────────────
-- Real-only views (what the app code touches by default) + directory
-- views (what the matching engine touches).
--
-- WITH CHECK OPTION ensures writes through the view can't produce a
-- shadow row — any INSERT/UPDATE that would set onboarding_status='shadow'
-- raises an error instead of silently being rejected.
CREATE VIEW public.business_profiles AS
  SELECT * FROM public.business_profiles_all
  WHERE onboarding_status != 'shadow'
  WITH CHECK OPTION;

CREATE VIEW public.newsletter_profiles AS
  SELECT * FROM public.newsletter_profiles_all
  WHERE onboarding_status != 'shadow'
  WITH CHECK OPTION;

CREATE VIEW public.business_directory AS
  SELECT * FROM public.business_profiles_all;

CREATE VIEW public.newsletter_directory AS
  SELECT * FROM public.newsletter_profiles_all;

-- Grant on views so non-service roles can still query (if any do; we've
-- verified the app uses service_role only, but the grant preserves future
-- flexibility). Views inherit RLS from base tables.
GRANT SELECT, INSERT, UPDATE ON public.business_profiles   TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE ON public.newsletter_profiles TO authenticated, anon;
-- directory views are matching-engine only; service_role bypasses grants.
-- No grants to authenticated/anon on directory views = defense in depth.

-- ── Step 5 ────────────────────────────────────────────────────────────
-- RLS on the base tables. service_role bypasses RLS so all app code paths
-- keep working. authenticated and anon can only SELECT non-shadow rows
-- (defense-in-depth on top of the view-level filter).
ALTER TABLE public.business_profiles_all   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_profiles_all ENABLE ROW LEVEL SECURITY;

-- Shadow rows are invisible to non-service-role queries on the base table
CREATE POLICY shadow_hidden_from_clients_b ON public.business_profiles_all
  FOR SELECT TO authenticated, anon
  USING (onboarding_status != 'shadow');

CREATE POLICY shadow_hidden_from_clients_n ON public.newsletter_profiles_all
  FOR SELECT TO authenticated, anon
  USING (onboarding_status != 'shadow');

-- Preserve existing INSERT/UPDATE capability via the views (no current
-- code path uses anon/auth for writes on these tables, but permissive
-- policies avoid regressions if something starts doing so).
CREATE POLICY allow_writes_b_insert ON public.business_profiles_all
  FOR INSERT TO authenticated, anon
  WITH CHECK (onboarding_status != 'shadow');

CREATE POLICY allow_writes_b_update ON public.business_profiles_all
  FOR UPDATE TO authenticated, anon
  USING (onboarding_status != 'shadow')
  WITH CHECK (onboarding_status != 'shadow');

CREATE POLICY allow_writes_n_insert ON public.newsletter_profiles_all
  FOR INSERT TO authenticated, anon
  WITH CHECK (onboarding_status != 'shadow');

CREATE POLICY allow_writes_n_update ON public.newsletter_profiles_all
  FOR UPDATE TO authenticated, anon
  USING (onboarding_status != 'shadow')
  WITH CHECK (onboarding_status != 'shadow');

-- DELETE is intentionally omitted — service_role only (current app behavior).

-- ── Step 6 ────────────────────────────────────────────────────────────
-- Partial indexes for shadow-row lookups (purge jobs, matching graph
-- traversal). Tiny because they cover only shadow rows.
CREATE INDEX IF NOT EXISTS business_profiles_all_shadow_idx
  ON public.business_profiles_all(onboarding_status)
  WHERE onboarding_status = 'shadow';

CREATE INDEX IF NOT EXISTS newsletter_profiles_all_shadow_idx
  ON public.newsletter_profiles_all(onboarding_status)
  WHERE onboarding_status = 'shadow';

CREATE INDEX IF NOT EXISTS business_profiles_all_shadow_source_idx
  ON public.business_profiles_all(shadow_source)
  WHERE shadow_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS newsletter_profiles_all_shadow_source_idx
  ON public.newsletter_profiles_all(shadow_source)
  WHERE shadow_source IS NOT NULL;

COMMIT;
