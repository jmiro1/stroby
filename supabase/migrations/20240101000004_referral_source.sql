-- Add referral_source to all profile tables
ALTER TABLE newsletter_profiles ADD COLUMN referral_source TEXT;
ALTER TABLE business_profiles ADD COLUMN referral_source TEXT;
ALTER TABLE other_profiles ADD COLUMN referral_source TEXT;
