-- Conversation summary + preferences for long-term AI memory
ALTER TABLE newsletter_profiles ADD COLUMN conversation_summary TEXT;
ALTER TABLE newsletter_profiles ADD COLUMN preferences JSONB DEFAULT '{}';

ALTER TABLE business_profiles ADD COLUMN conversation_summary TEXT;
ALTER TABLE business_profiles ADD COLUMN preferences JSONB DEFAULT '{}';

ALTER TABLE other_profiles ADD COLUMN conversation_summary TEXT;
ALTER TABLE other_profiles ADD COLUMN preferences JSONB DEFAULT '{}';

-- Idempotency: unique index on whatsapp_message_id to prevent duplicate processing
CREATE UNIQUE INDEX idx_agent_messages_wa_id
  ON agent_messages (whatsapp_message_id)
  WHERE whatsapp_message_id IS NOT NULL;
