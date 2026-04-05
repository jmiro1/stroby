-- Track which engagement drips have been sent per user
ALTER TABLE newsletter_profiles ADD COLUMN drips_sent TEXT[] DEFAULT '{}';
ALTER TABLE business_profiles ADD COLUMN drips_sent TEXT[] DEFAULT '{}';
ALTER TABLE other_profiles ADD COLUMN drips_sent TEXT[] DEFAULT '{}';
