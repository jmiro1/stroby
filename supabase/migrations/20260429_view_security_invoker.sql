-- ======================================================================
-- Tighten directory views: enforce security_invoker
-- ======================================================================
-- Postgres views default to running with the view-owner's permissions
-- (effectively bypassing RLS on underlying tables). The *_directory
-- views were leaking all rows — including shadow profiles — to the
-- anon role. Underlying tables already have correct RLS:
--
--   newsletter_profiles_all → anon sees only non-shadow (3 rows today)
--   other_profiles          → anon sees nothing (no policy = deny)
--   business_profiles_all   → anon sees only non-shadow (3 rows today)
--
-- With security_invoker=true the views inherit the calling role's RLS,
-- so anon traffic against these views now properly hides shadow rows.
-- The matching engine (intelligence/matching.ts, lib/matching.ts) and
-- the public newsletter listing pages (app/newsletters/...) all use
-- createServiceClient(), which bypasses RLS regardless — so this change
-- has no effect on server-side reads.
--
-- Also applied to newsletter_profiles + business_profiles for defense
-- in depth — they already filter shadow via WHERE, but security_invoker
-- prevents future bypass via view modification.
-- ======================================================================

BEGIN;

ALTER VIEW public.newsletter_directory      SET (security_invoker = true);
ALTER VIEW public.creator_directory_unified SET (security_invoker = true);
ALTER VIEW public.business_directory        SET (security_invoker = true);
ALTER VIEW public.newsletter_profiles       SET (security_invoker = true);
ALTER VIEW public.business_profiles         SET (security_invoker = true);

COMMIT;
