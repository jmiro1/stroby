-- ============================================================
-- Migration 003: Expand matching to support all creator types
-- ============================================================

-- 1. Add partner_preference to business_profiles
ALTER TABLE business_profiles
  ADD COLUMN partner_preference TEXT DEFAULT 'all'
    CHECK (partner_preference IN ('newsletters_only', 'creators_only', 'all'));

-- 2. Add creator_id + creator_type to introductions so we can reference
--    either newsletter_profiles or other_profiles
ALTER TABLE introductions
  ADD COLUMN creator_id UUID,
  ADD COLUMN creator_type TEXT CHECK (creator_type IN ('newsletter', 'other'));

-- 3. Backfill existing rows: copy newsletter_id → creator_id, set type
UPDATE introductions
  SET creator_id = newsletter_id, creator_type = 'newsletter'
  WHERE newsletter_id IS NOT NULL;

-- 4. Make newsletter_id nullable (was NOT NULL with FK)
ALTER TABLE introductions ALTER COLUMN newsletter_id DROP NOT NULL;

-- 5. Index for creator lookups
CREATE INDEX idx_introductions_creator ON introductions (creator_id, creator_type);

-- 6. Update agent_messages user_type to support 'other'
ALTER TABLE agent_messages DROP CONSTRAINT IF EXISTS agent_messages_user_type_check;
ALTER TABLE agent_messages ADD CONSTRAINT agent_messages_user_type_check
  CHECK (user_type IN ('newsletter', 'business', 'other'));
