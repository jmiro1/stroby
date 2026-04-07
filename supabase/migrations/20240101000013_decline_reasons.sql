-- ============================================================
-- Decline reason tracking
-- Capture *why* users decline matches (not just which niche),
-- so the matching engine can learn from text feedback.
-- ============================================================

-- 1. Store the decline reason on the introduction itself
ALTER TABLE introductions
  ADD COLUMN IF NOT EXISTS decline_reason     TEXT,
  ADD COLUMN IF NOT EXISTS decline_reason_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS declined_by        TEXT
    CHECK (declined_by IN ('business', 'newsletter', 'other'));

-- Index for analysis queries (find all declined intros with reasons)
CREATE INDEX IF NOT EXISTS idx_introductions_decline_reason
  ON introductions (declined_by, decline_reason_at)
  WHERE decline_reason IS NOT NULL;

-- 2. Track which intro a profile is currently being asked
--    to give a decline reason for. Cleared when reason is captured.
ALTER TABLE newsletter_profiles
  ADD COLUMN IF NOT EXISTS awaiting_decline_reason_intro_id UUID
    REFERENCES introductions(id) ON DELETE SET NULL;

ALTER TABLE business_profiles
  ADD COLUMN IF NOT EXISTS awaiting_decline_reason_intro_id UUID
    REFERENCES introductions(id) ON DELETE SET NULL;

ALTER TABLE other_profiles
  ADD COLUMN IF NOT EXISTS awaiting_decline_reason_intro_id UUID
    REFERENCES introductions(id) ON DELETE SET NULL;
