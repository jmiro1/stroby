-- ======================================================================
-- Multi-platform matching, Phase B — eligibility trigger for other_profiles
-- ======================================================================
-- Mirrors the newsletter trigger (compute_creator_match_eligible) but
-- with per-platform required-field rules. Different platforms have
-- different "what does a complete profile look like" — a YouTuber needs
-- subscriber count + view rate, a podcaster needs listener count +
-- completion rate, etc.
--
-- Bonus scoring (up to 30 pts on top of the 70-pt required gates):
--   - content_intelligence populated → +15 (rare for non-newsletter v1
--     since profilers aren't built yet)
--   - role/organization both populated → +15 (proxy for "this profile
--     has been filled out beyond the bare minimum")
-- ======================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.compute_other_match_eligible()
RETURNS TRIGGER AS $$
DECLARE
  has_reach    BOOLEAN := NEW.audience_reach IS NOT NULL AND NEW.audience_reach > 0;
  has_engage   BOOLEAN := (NEW.engagement_rate IS NOT NULL AND NEW.engagement_rate > 0)
                       OR (NEW.avg_open_rate    IS NOT NULL AND NEW.avg_open_rate    > 0);
  has_descr    BOOLEAN := NEW.description IS NOT NULL AND length(NEW.description) >= 100;
  has_price    BOOLEAN := NEW.price_per_placement IS NOT NULL OR COALESCE(NEW.open_to_inquiries, false) = true;
  has_embed    BOOLEAN := NEW.profile_embedding IS NOT NULL;
  bonus_score  INTEGER := 0;
  -- Per-platform: blog/other don't strictly need engagement (no clean
  -- engagement metric), but everything else does.
  needs_engage BOOLEAN := COALESCE(NEW.platform, 'other') NOT IN ('blog', 'other');
BEGIN
  -- Bonus signals
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

  NEW.match_eligible := has_reach
    AND (has_engage OR NOT needs_engage)
    AND has_descr
    AND has_price
    AND has_embed;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_other_match_eligible ON public.other_profiles;
CREATE TRIGGER set_other_match_eligible
  BEFORE INSERT OR UPDATE ON public.other_profiles
  FOR EACH ROW EXECUTE FUNCTION public.compute_other_match_eligible();

COMMIT;
