-- Performance indexes — hottest query paths

-- Phone lookups (every inbound WhatsApp message does 3 table scans by phone)
CREATE INDEX IF NOT EXISTS idx_newsletter_profiles_phone ON newsletter_profiles (phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_business_profiles_phone ON business_profiles (phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_other_profiles_phone ON other_profiles (phone) WHERE phone IS NOT NULL;

-- agent_messages: high-volume table, queried by phone+direction, created_at, user_id+direction
CREATE INDEX IF NOT EXISTS idx_agent_messages_phone_dir ON agent_messages (phone, direction, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_messages_created ON agent_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_messages_dir_created ON agent_messages (direction, created_at DESC) WHERE user_id IS NOT NULL;

-- Flagged messages: admin dashboard queries unreviewed
CREATE INDEX IF NOT EXISTS idx_flagged_messages_reviewed ON flagged_messages (reviewed, created_at DESC);
