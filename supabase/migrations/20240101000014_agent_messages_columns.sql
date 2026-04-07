-- ============================================================
-- agent_messages: add missing columns and relax message_type
-- ============================================================
-- The webhook + message helpers reference columns and message_type values
-- that were never added to the schema. Inserts referencing them fail
-- silently (the helper logs and returns), which means inbound WhatsApp
-- messages have been disappearing instead of being persisted — the model
-- never sees conversation history and re-asks the same questions every turn.
-- ============================================================

-- 1. Missing columns
ALTER TABLE agent_messages
  ADD COLUMN IF NOT EXISTS media_url    TEXT,
  ADD COLUMN IF NOT EXISTS media_count  INTEGER,
  ADD COLUMN IF NOT EXISTS external_id  TEXT;

-- 2. Drop the overly-narrow message_type CHECK constraint. The codebase has
--    grown well past the original 6 enum values (decline_ack, intro_request,
--    introduction_made, match_details, match_suggestion, monthly_recap,
--    newsletter_declined_notify, onboarding, payment_link, post_intro_followup,
--    stripe_connect, verification, expired_notification, debug_error, …).
--    Free-form text is fine here — these are internal markers, not user input.
ALTER TABLE agent_messages
  DROP CONSTRAINT IF EXISTS agent_messages_message_type_check;
