-- Slugs for public creator profiles
ALTER TABLE newsletter_profiles ADD COLUMN slug TEXT UNIQUE;
ALTER TABLE other_profiles ADD COLUMN slug TEXT UNIQUE;

CREATE INDEX idx_newsletter_slug ON newsletter_profiles (slug) WHERE slug IS NOT NULL;
CREATE INDEX idx_other_slug ON other_profiles (slug) WHERE slug IS NOT NULL;
