-- Add activity_status column to track whether shadow profiles are active
-- Values: 'active', 'inactive', NULL (not yet checked)

ALTER TABLE newsletter_profiles_all
  ADD COLUMN IF NOT EXISTS activity_status TEXT;

ALTER TABLE business_profiles_all
  ADD COLUMN IF NOT EXISTS activity_status TEXT;

-- Recreate views to include new column
DROP VIEW IF EXISTS newsletter_profiles;
DROP VIEW IF EXISTS newsletter_directory;
DROP VIEW IF EXISTS business_profiles;
DROP VIEW IF EXISTS business_directory;

CREATE VIEW newsletter_profiles
  WITH (security_invoker = true)
  AS SELECT * FROM newsletter_profiles_all
     WHERE onboarding_status IS DISTINCT FROM 'shadow'
  WITH CHECK OPTION;

CREATE VIEW newsletter_directory
  WITH (security_invoker = true)
  AS SELECT * FROM newsletter_profiles_all;

CREATE VIEW business_profiles
  WITH (security_invoker = true)
  AS SELECT * FROM business_profiles_all
     WHERE onboarding_status IS DISTINCT FROM 'shadow'
  WITH CHECK OPTION;

CREATE VIEW business_directory
  WITH (security_invoker = true)
  AS SELECT * FROM business_profiles_all;
