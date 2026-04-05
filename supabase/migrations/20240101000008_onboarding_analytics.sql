-- Track onboarding funnel events
CREATE TABLE onboarding_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  TEXT NOT NULL,
  event       TEXT NOT NULL, -- 'started', 'role_selected', 'step_completed', 'completed', 'abandoned'
  user_type   TEXT, -- 'business', 'influencer', 'other'
  step_number INTEGER,
  step_field  TEXT,
  source      TEXT, -- 'website', 'whatsapp'
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_onboarding_events_session ON onboarding_events (session_id);
CREATE INDEX idx_onboarding_events_event ON onboarding_events (event);
