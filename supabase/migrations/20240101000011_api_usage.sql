-- Track API usage for cost dashboard
CREATE TABLE api_usage (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider       TEXT NOT NULL, -- 'anthropic', 'openai', 'meta'
  model          TEXT,
  route          TEXT, -- 'ai-agent', 'onboarding', 'matching', 'verification', 'tts'
  tokens_in      INTEGER DEFAULT 0,
  tokens_out     INTEGER DEFAULT 0,
  cost_estimate  DECIMAL(12, 8) DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_api_usage_created ON api_usage (created_at DESC);
CREATE INDEX idx_api_usage_provider ON api_usage (provider, created_at DESC);
