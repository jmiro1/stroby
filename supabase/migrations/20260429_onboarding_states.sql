-- ======================================================================
-- WhatsApp onboarding state — durable persistence
-- ======================================================================
-- Replaces the [STATE]{json} marker protocol the AI was emitting on every
-- onboarding turn. That worked but was fragile: model occasionally forgot
-- the marker, JSON occasionally malformed, state lived only in chat
-- history. New design: state is the source of truth, persisted in this
-- table, updated by Anthropic tool calls, injected into the system prompt
-- each turn so the model always has an accurate snapshot.
--
-- Row is created on first onboarding message and deleted once the profile
-- is created (createProfileFromOnboarding). Phone is the natural key
-- because users have no profile id yet.
-- ======================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.onboarding_states (
  phone        TEXT PRIMARY KEY,
  state        JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_type    TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Service-role-only — onboarding state is internal infra, never client-readable
ALTER TABLE public.onboarding_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS onboarding_states_service_only ON public.onboarding_states;
CREATE POLICY onboarding_states_service_only
  ON public.onboarding_states
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_onboarding_states_updated_at
  ON public.onboarding_states (updated_at DESC);

COMMENT ON TABLE public.onboarding_states IS
  'In-progress WhatsApp onboarding. Cleared on profile creation.';

COMMIT;
