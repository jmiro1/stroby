-- ======================================================================
-- Phase 1 follow-up — surface match_eligible* on directory views
-- ======================================================================
-- The previous migration added match_eligible and match_eligibility_score
-- to *_profiles_all but the directory views still only enumerate the
-- pre-existing columns. The matching engine queries the views; without
-- this update its filter on match_eligible silently returns 0 rows.
-- ======================================================================

BEGIN;

-- Directory views (full — see real + shadow rows; matching engine uses these)
CREATE OR REPLACE VIEW public.business_directory AS
  SELECT
    id, company_name, contact_name, contact_role, email, phone,
    product_description, target_customer, primary_niche, description,
    budget_range, campaign_goal, timeline, is_agency, agency_parent_id,
    is_active, onboarding_status, created_at, updated_at,
    partner_preference, referral_source, conversation_summary,
    preferences, drips_sent, awaiting_decline_reason_intro_id,
    affiliate_id, brand_intelligence, profile_embedding,
    shadow_source, claimed_at, campaign_outcome,
    preferred_creator_type, preferred_creator_size,
    activity_status, email_verified,
    match_eligible, match_eligibility_score
  FROM public.business_profiles_all;

CREATE OR REPLACE VIEW public.newsletter_directory AS
  SELECT n.*  -- includes new match_eligible and match_eligibility_score columns
  FROM public.newsletter_profiles_all n;

-- Filtered views (real users only — shadows hidden; matching engine reads
-- the REQUESTING side here)
CREATE OR REPLACE VIEW public.business_profiles AS
  SELECT
    id, company_name, contact_name, contact_role, email, phone,
    product_description, target_customer, primary_niche, description,
    budget_range, campaign_goal, timeline, is_agency, agency_parent_id,
    is_active, onboarding_status, created_at, updated_at,
    partner_preference, referral_source, conversation_summary,
    preferences, drips_sent, awaiting_decline_reason_intro_id,
    affiliate_id, brand_intelligence, profile_embedding,
    shadow_source, claimed_at, campaign_outcome,
    preferred_creator_type, preferred_creator_size,
    activity_status, email_verified,
    match_eligible, match_eligibility_score
  FROM public.business_profiles_all
  WHERE onboarding_status IS DISTINCT FROM 'shadow';

CREATE OR REPLACE VIEW public.newsletter_profiles AS
  SELECT n.*
  FROM public.newsletter_profiles_all n
  WHERE n.onboarding_status IS DISTINCT FROM 'shadow';

COMMIT;
