-- ======================================================================
-- Shadow eligibility — relaxed gate
-- ======================================================================
-- Original eligibility triggers required all 5 signals (creators) or all 5
-- (brands). That works for real onboarded users — they fill the full
-- profile. But shadow rows scraped from public sources (Beehiiv lists,
-- Substack, YC company pages) will NEVER have engagement_rate /
-- price_per_placement / target_customer / campaign_outcome from the
-- public data alone. Result: 0 of 5,540 creators and 0 of 14,898 brands
-- are eligible today, and the matching engine returns [] for every
-- request.
--
-- New rule: differentiate by `onboarding_status`.
-- - **Real users** (status != 'shadow'): all 5 gates required (unchanged)
-- - **Shadows**: relaxed gate
--     creators: reach + description + embedding (engagement and price
--       become optional — defaulted/handled at intro time)
--     brands: brand_intelligence + embedding (the structured columns
--       like target_customer come from intel JSON for shadows; we trust
--       the scraped intel as a proxy)
--     other_profiles: reach + description + embedding (same as creators,
--       no platform-specific engagement requirement)
--
-- Scoring (match_eligibility_score) keeps the 5-gate weighting so a
-- shadow with thin data shows ~56-72/100 — signal to the caller that
-- this is a candidate, not a fully-onboarded user.
-- ======================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.compute_creator_match_eligible()
RETURNS TRIGGER AS $$
DECLARE
  has_reach    BOOLEAN := NEW.audience_reach IS NOT NULL AND NEW.audience_reach > 0;
  has_engage   BOOLEAN := (NEW.engagement_rate IS NOT NULL AND NEW.engagement_rate > 0)
                       OR (NEW.avg_open_rate    IS NOT NULL AND NEW.avg_open_rate    > 0);
  has_descr    BOOLEAN := NEW.description IS NOT NULL AND length(NEW.description) >= 100;
  has_price    BOOLEAN := NEW.price_per_placement IS NOT NULL OR COALESCE(NEW.open_to_inquiries, false) = true;
  has_embed    BOOLEAN := NEW.profile_embedding IS NOT NULL;
  is_shadow    BOOLEAN := NEW.onboarding_status = 'shadow';
  bonus_score  INTEGER := 0;
BEGIN
  IF NEW.content_intelligence IS NOT NULL THEN bonus_score := bonus_score + 15; END IF;
  IF NEW.platform_metrics IS NOT NULL AND NEW.platform_metrics::text <> '{}' THEN bonus_score := bonus_score + 15; END IF;

  NEW.match_eligibility_score := LEAST(100,
      (CASE WHEN has_reach  THEN 14 ELSE 0 END)
    + (CASE WHEN has_engage THEN 14 ELSE 0 END)
    + (CASE WHEN has_descr  THEN 14 ELSE 0 END)
    + (CASE WHEN has_price  THEN 14 ELSE 0 END)
    + (CASE WHEN has_embed  THEN 14 ELSE 0 END)
    + bonus_score
  );

  -- Shadow rows: relaxed gate (reach + descr + embed). Engagement/price
  -- are nice-to-haves but not required — they come at claim time.
  -- Real users: all 5 required.
  IF is_shadow THEN
    NEW.match_eligible := has_reach AND has_descr AND has_embed;
  ELSE
    NEW.match_eligible := has_reach AND has_engage AND has_descr AND has_price AND has_embed;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION public.compute_brand_match_eligible()
RETURNS TRIGGER AS $$
DECLARE
  has_product   BOOLEAN := NEW.product_description IS NOT NULL AND length(NEW.product_description) >= 50;
  has_target    BOOLEAN := NEW.target_customer     IS NOT NULL AND length(NEW.target_customer)     >= 50;
  has_budget    BOOLEAN := NEW.budget_range        IS NOT NULL AND length(NEW.budget_range)        >  0;
  has_outcome   BOOLEAN := NEW.campaign_outcome    IS NOT NULL;
  has_embed     BOOLEAN := NEW.profile_embedding   IS NOT NULL;
  has_intel     BOOLEAN := NEW.brand_intelligence IS NOT NULL AND NEW.brand_intelligence::text <> '{}';
  is_shadow     BOOLEAN := NEW.onboarding_status = 'shadow';
  bonus_score   INTEGER := 0;
BEGIN
  IF NEW.brand_intelligence IS NOT NULL THEN bonus_score := bonus_score + 15; END IF;
  IF NEW.preferences IS NOT NULL AND NEW.preferences ? 'past_newsletter_sponsors' THEN
    bonus_score := bonus_score + 15;
  END IF;

  NEW.match_eligibility_score := LEAST(100,
      (CASE WHEN has_product THEN 14 ELSE 0 END)
    + (CASE WHEN has_target  THEN 14 ELSE 0 END)
    + (CASE WHEN has_budget  THEN 14 ELSE 0 END)
    + (CASE WHEN has_outcome THEN 14 ELSE 0 END)
    + (CASE WHEN has_embed   THEN 14 ELSE 0 END)
    + bonus_score
  );

  -- Shadow brands: brand_intelligence + embedding is enough. The matching
  -- engine reads target/product/themes directly from the intel JSON via
  -- normalizeBrandSynth(); structured columns aren't needed for shadows.
  -- Real users: all 5 required.
  IF is_shadow THEN
    NEW.match_eligible := has_intel AND has_embed;
  ELSE
    NEW.match_eligible := has_product AND has_target AND has_budget AND has_outcome AND has_embed;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION public.compute_other_match_eligible()
RETURNS TRIGGER AS $$
DECLARE
  has_reach    BOOLEAN := NEW.audience_reach IS NOT NULL AND NEW.audience_reach > 0;
  has_engage   BOOLEAN := (NEW.engagement_rate IS NOT NULL AND NEW.engagement_rate > 0)
                       OR (NEW.avg_open_rate    IS NOT NULL AND NEW.avg_open_rate    > 0);
  has_descr    BOOLEAN := NEW.description IS NOT NULL AND length(NEW.description) >= 100;
  has_price    BOOLEAN := NEW.price_per_placement IS NOT NULL OR COALESCE(NEW.open_to_inquiries, false) = true;
  has_embed    BOOLEAN := NEW.profile_embedding IS NOT NULL;
  is_shadow    BOOLEAN := NEW.onboarding_status = 'shadow';
  bonus_score  INTEGER := 0;
  needs_engage BOOLEAN := COALESCE(NEW.platform, 'other') NOT IN ('blog', 'other');
BEGIN
  IF NEW.content_intelligence IS NOT NULL THEN bonus_score := bonus_score + 15; END IF;
  IF NEW.role IS NOT NULL AND NEW.organization IS NOT NULL THEN bonus_score := bonus_score + 15; END IF;

  NEW.match_eligibility_score := LEAST(100,
      (CASE WHEN has_reach  THEN 14 ELSE 0 END)
    + (CASE WHEN has_engage OR NOT needs_engage THEN 14 ELSE 0 END)
    + (CASE WHEN has_descr  THEN 14 ELSE 0 END)
    + (CASE WHEN has_price  THEN 14 ELSE 0 END)
    + (CASE WHEN has_embed  THEN 14 ELSE 0 END)
    + bonus_score
  );

  IF is_shadow THEN
    NEW.match_eligible := has_reach AND has_descr AND has_embed;
  ELSE
    NEW.match_eligible := has_reach
      AND (has_engage OR NOT needs_engage)
      AND has_descr
      AND has_price
      AND has_embed;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- Reprocess existing rows so eligibility flags reflect the new logic.
-- Touch each row with a no-op UPDATE; the trigger fires and recomputes.
-- Doing it outside the BEGIN/COMMIT above keeps the trigger redefinition
-- atomic vs. the (slow) backfill.

UPDATE public.newsletter_profiles_all SET id = id;
UPDATE public.business_profiles_all   SET id = id;
UPDATE public.other_profiles          SET id = id;
