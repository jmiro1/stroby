-- ======================================================================
-- Multi-platform matching, Phase A — unified creator directory view
-- ======================================================================
-- Single SELECT surface the matching engine reads from. UNIONs newsletter
-- and other_profiles into one shape with creator_type + platform
-- discriminators. The rest of the engine is platform-aware via runtime
-- helpers (effectiveMonthlyImpressions, per-platform engagement
-- thresholds), not via different code paths per type.
--
-- Existing newsletter_directory and other ad-hoc paths stay in place for
-- backward compatibility; the new view is what intelligence/matching.ts
-- queries going forward.
-- ======================================================================

BEGIN;

-- security_invoker=true so anon RLS on underlying tables applies (matches
-- the pattern in 20260424_email_verified.sql for business_directory).
CREATE OR REPLACE VIEW public.creator_directory_unified
  WITH (security_invoker = true)
AS
  SELECT
    n.id,
    'newsletter'                      AS creator_type,
    COALESCE(n.platform, 'newsletter') AS platform,
    n.newsletter_name                 AS creator_name,
    n.primary_niche,
    n.description,
    n.audience_reach,
    n.engagement_rate,
    n.avg_open_rate,
    n.price_per_placement,
    n.content_intelligence,
    n.profile_embedding,
    n.onboarding_status,
    n.match_eligible,
    n.match_eligibility_score,
    n.open_to_inquiries,
    n.is_active,
    n.platform_metrics                AS platform_metrics
  FROM public.newsletter_profiles_all n
  UNION ALL
  SELECT
    o.id,
    'other'                           AS creator_type,
    COALESCE(o.platform, 'other')     AS platform,
    o.name                            AS creator_name,
    o.niche                           AS primary_niche,
    o.description,
    o.audience_reach,
    o.engagement_rate,
    o.avg_open_rate,
    o.price_per_placement,
    o.content_intelligence,
    o.profile_embedding,
    o.onboarding_status,
    o.match_eligible,
    o.match_eligibility_score,
    o.open_to_inquiries,
    o.is_active,
    NULL::jsonb                       AS platform_metrics
  FROM public.other_profiles o;

COMMENT ON VIEW public.creator_directory_unified IS
  'Single SELECT surface for the matching engine. Unions newsletter_profiles_all + other_profiles. creator_type=''newsletter''|''other'', platform is one of {newsletter, youtube, podcast, instagram, tiktok, linkedin, twitter, blog, other}. Per-platform scoring adjustments live in lib/intelligence/matching.ts.';

COMMIT;
