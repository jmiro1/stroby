-- Layer 2: Brand Intelligence
-- Stores structured brand profile data extracted from website scraping,
-- onboarding answers, and competitive intelligence.
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS brand_intelligence JSONB DEFAULT NULL;
