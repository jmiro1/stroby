-- Track whether shadow profile emails are confirmed vs guessed
-- Values: 'confirmed' (scraped from website), 'guessed' (firstname@domain), NULL (not checked)

ALTER TABLE business_profiles_all
  ADD COLUMN IF NOT EXISTS email_verified TEXT;

-- Recreate views to include new column
DROP VIEW IF EXISTS business_profiles;
DROP VIEW IF EXISTS business_directory;

CREATE VIEW business_profiles
  WITH (security_invoker = true)
  AS SELECT * FROM business_profiles_all
     WHERE onboarding_status IS DISTINCT FROM 'shadow'
  WITH CHECK OPTION;

CREATE VIEW business_directory
  WITH (security_invoker = true)
  AS SELECT * FROM business_profiles_all;
