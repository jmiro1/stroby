-- Flagged off-topic or suspicious messages for review
CREATE TABLE flagged_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID,
  user_type       TEXT,
  phone           TEXT NOT NULL,
  content         TEXT NOT NULL,
  flag_reason     TEXT NOT NULL,
  reviewed        BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_flagged_messages_reviewed ON flagged_messages (reviewed) WHERE reviewed = false;
