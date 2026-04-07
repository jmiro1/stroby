-- ============================================================
-- Drop brittle CHECK constraints on user-supplied semantic fields
-- ============================================================
-- Onboarding is conversational — users describe themselves in their own
-- words and the LLM extracts free text. CHECK constraints with hardcoded
-- enum values silently fail every insert that doesn't match a magic word,
-- leaving the bot saying "you're all set" while no profile actually exists.
--
-- Keeping: code-managed status fields (verification_status, onboarding_status,
-- introduction status, transaction status, agent_messages.direction,
-- *_rating ranges) — those are written only by Stroby itself, never by users.
--
-- Dropping: anything the user describes with their own words.
-- ============================================================

ALTER TABLE newsletter_profiles
  DROP CONSTRAINT IF EXISTS newsletter_profiles_platform_check;

ALTER TABLE business_profiles
  DROP CONSTRAINT IF EXISTS business_profiles_budget_range_check,
  DROP CONSTRAINT IF EXISTS business_profiles_campaign_goal_check,
  DROP CONSTRAINT IF EXISTS business_profiles_timeline_check;
