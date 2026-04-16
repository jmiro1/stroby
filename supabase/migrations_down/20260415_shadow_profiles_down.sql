-- ======================================================================
-- Shadow Profiles — DOWN migration
-- ======================================================================
-- Reverses 20260415_shadow_profiles.sql. Leaves the *_backup_20260415
-- tables in place (drop them manually if you want; safe to keep for
-- audit).
--
-- NOT auto-run by Supabase CLI. To roll back:
--   1. Run this file against the DB (psql or supabase db query)
--   2. Redeploy the V1 code from jmiro1/stroby-v1 (see REVERT.md)
-- ======================================================================

BEGIN;

-- ── Reverse step 6: drop indexes ──────────────────────────────────────
DROP INDEX IF EXISTS public.business_profiles_all_shadow_idx;
DROP INDEX IF EXISTS public.newsletter_profiles_all_shadow_idx;
DROP INDEX IF EXISTS public.business_profiles_all_shadow_source_idx;
DROP INDEX IF EXISTS public.newsletter_profiles_all_shadow_source_idx;

-- ── Reverse step 5: drop policies + disable RLS ───────────────────────
DROP POLICY IF EXISTS shadow_hidden_from_clients_b ON public.business_profiles_all;
DROP POLICY IF EXISTS shadow_hidden_from_clients_n ON public.newsletter_profiles_all;
DROP POLICY IF EXISTS allow_writes_b_insert ON public.business_profiles_all;
DROP POLICY IF EXISTS allow_writes_b_update ON public.business_profiles_all;
DROP POLICY IF EXISTS allow_writes_n_insert ON public.newsletter_profiles_all;
DROP POLICY IF EXISTS allow_writes_n_update ON public.newsletter_profiles_all;

ALTER TABLE public.business_profiles_all   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_profiles_all DISABLE ROW LEVEL SECURITY;

-- ── Reverse step 4: drop views ────────────────────────────────────────
DROP VIEW IF EXISTS public.business_profiles;
DROP VIEW IF EXISTS public.newsletter_profiles;
DROP VIEW IF EXISTS public.business_directory;
DROP VIEW IF EXISTS public.newsletter_directory;

-- ── Reverse step 3: rename tables back ────────────────────────────────
ALTER TABLE public.business_profiles_all   RENAME TO business_profiles;
ALTER TABLE public.newsletter_profiles_all RENAME TO newsletter_profiles;

-- ── Reverse step 2: drop the new columns ──────────────────────────────
-- (Data in these columns is lost. If shadow rows existed, they're
-- still in the tables with onboarding_status='shadow' — step 1 reversal
-- below will fail the check-constraint on them, so delete them first.)
DELETE FROM public.business_profiles   WHERE onboarding_status = 'shadow';
DELETE FROM public.newsletter_profiles WHERE onboarding_status = 'shadow';

ALTER TABLE public.business_profiles
  DROP COLUMN IF EXISTS shadow_source,
  DROP COLUMN IF EXISTS claimed_at;

ALTER TABLE public.newsletter_profiles
  DROP COLUMN IF EXISTS shadow_source,
  DROP COLUMN IF EXISTS claimed_at;

-- ── Reverse step 1: restore original check constraints ────────────────
ALTER TABLE public.business_profiles
  DROP CONSTRAINT IF EXISTS business_profiles_onboarding_status_check;
ALTER TABLE public.business_profiles
  ADD CONSTRAINT business_profiles_onboarding_status_check
    CHECK (onboarding_status IN (
      'started', 'widget_complete', 'whatsapp_active', 'fully_onboarded'
    ));

ALTER TABLE public.newsletter_profiles
  DROP CONSTRAINT IF EXISTS newsletter_profiles_onboarding_status_check;
ALTER TABLE public.newsletter_profiles
  ADD CONSTRAINT newsletter_profiles_onboarding_status_check
    CHECK (onboarding_status IN (
      'started', 'widget_complete', 'whatsapp_active',
      'verified', 'stripe_connected', 'fully_onboarded'
    ));

-- Step 0 backup tables are INTENTIONALLY NOT DROPPED. Drop them
-- yourself once you're confident the rollback worked:
--   DROP TABLE public.business_profiles_backup_20260415;
--   DROP TABLE public.newsletter_profiles_backup_20260415;

COMMIT;
