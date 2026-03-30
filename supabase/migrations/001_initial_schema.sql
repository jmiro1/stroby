-- ============================================================
-- Stroby Initial Schema Migration
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- updated_at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 1. newsletter_profiles
-- ============================================================
CREATE TABLE newsletter_profiles (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsletter_name      TEXT NOT NULL,
  owner_name           TEXT NOT NULL,
  email                TEXT NOT NULL UNIQUE,
  phone                TEXT NOT NULL,
  url                  TEXT,
  platform             TEXT CHECK (platform IN ('beehiiv', 'substack', 'convertkit', 'mailchimp', 'other')),
  primary_niche        TEXT NOT NULL,
  description          TEXT,
  subscriber_count     INTEGER,
  avg_open_rate        DECIMAL(5,4),
  avg_ctr              DECIMAL(5,4),
  price_per_placement  INTEGER,  -- cents
  ad_formats           TEXT[],
  frequency            TEXT,
  verification_status  TEXT DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'screenshot', 'api_verified')),
  verification_data    JSONB,
  stripe_account_id    TEXT,
  avg_match_rating     DECIMAL(3,2) DEFAULT 0,
  total_deals          INTEGER DEFAULT 0,
  is_active            BOOLEAN DEFAULT true,
  onboarding_status    TEXT DEFAULT 'started' CHECK (onboarding_status IN ('started', 'widget_complete', 'whatsapp_active', 'verified', 'stripe_connected', 'fully_onboarded')),
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER set_newsletter_profiles_updated_at
  BEFORE UPDATE ON newsletter_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 2. business_profiles
-- ============================================================
CREATE TABLE business_profiles (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name       TEXT NOT NULL,
  contact_name       TEXT NOT NULL,
  contact_role       TEXT,
  email              TEXT NOT NULL UNIQUE,
  phone              TEXT NOT NULL,
  product_description TEXT,
  target_customer    TEXT,
  primary_niche      TEXT NOT NULL,
  description        TEXT,
  budget_range       TEXT CHECK (budget_range IN ('<500', '500-1000', '1000-2500', '2500-5000', '5000+')),
  campaign_goal      TEXT CHECK (campaign_goal IN ('brand_awareness', 'direct_response', 'lead_generation')),
  timeline           TEXT CHECK (timeline IN ('asap', 'this_month', 'exploring')),
  is_agency          BOOLEAN DEFAULT false,
  agency_parent_id   UUID REFERENCES business_profiles(id),
  is_active          BOOLEAN DEFAULT true,
  onboarding_status  TEXT DEFAULT 'started' CHECK (onboarding_status IN ('started', 'widget_complete', 'whatsapp_active', 'fully_onboarded')),
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER set_business_profiles_updated_at
  BEFORE UPDATE ON business_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 3. introductions
-- ============================================================
CREATE TABLE introductions (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id              UUID NOT NULL REFERENCES business_profiles(id),
  newsletter_id            UUID NOT NULL REFERENCES newsletter_profiles(id),
  status                   TEXT NOT NULL CHECK (status IN (
                             'suggested', 'business_accepted', 'business_declined',
                             'newsletter_pending', 'newsletter_accepted', 'newsletter_declined',
                             'introduced', 'expired', 'completed'
                           )),
  match_score              DECIMAL(5,4),
  match_reasoning          TEXT,
  business_response_at     TIMESTAMPTZ,
  newsletter_response_at   TIMESTAMPTZ,
  introduced_at            TIMESTAMPTZ,
  introduction_method      TEXT CHECK (introduction_method IN ('whatsapp_group', 'email')),
  business_rating          INTEGER CHECK (business_rating BETWEEN 1 AND 5),
  newsletter_rating        INTEGER CHECK (newsletter_rating BETWEEN 1 AND 5),
  business_feedback        TEXT,
  newsletter_feedback      TEXT,
  became_deal              BOOLEAN DEFAULT false,
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER set_introductions_updated_at
  BEFORE UPDATE ON introductions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 4. transactions
-- ============================================================
CREATE TABLE transactions (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  introduction_id          UUID NOT NULL REFERENCES introductions(id),
  business_id              UUID REFERENCES business_profiles(id),
  newsletter_id            UUID REFERENCES newsletter_profiles(id),
  amount                   INTEGER NOT NULL,   -- cents
  commission               INTEGER NOT NULL,   -- cents
  payout_amount            INTEGER NOT NULL,   -- cents
  status                   TEXT NOT NULL CHECK (status IN (
                             'pending_payment', 'escrowed', 'placement_delivered',
                             'proof_submitted', 'appeal_window', 'appeal_filed',
                             'released', 'refunded', 'partial_refund'
                           )),
  stripe_payment_intent_id TEXT,
  stripe_transfer_id       TEXT,
  utm_link                 TEXT NOT NULL,
  utm_slug                 TEXT NOT NULL UNIQUE,
  agreed_deliverables      JSONB,
  reported_clicks          INTEGER,
  tracked_clicks           INTEGER DEFAULT 0,
  reported_opens           INTEGER,
  proof_screenshot_url     TEXT,
  proof_submitted_at       TIMESTAMPTZ,
  appeal_deadline          TIMESTAMPTZ,
  appeal_reason            TEXT,
  appeal_resolution        TEXT,
  released_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER set_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 5. utm_clicks
-- ============================================================
CREATE TABLE utm_clicks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id  UUID REFERENCES transactions(id),
  utm_slug        TEXT NOT NULL,
  clicked_at      TIMESTAMPTZ DEFAULT now(),
  ip_hash         TEXT,
  user_agent      TEXT,
  referer         TEXT
);

-- ============================================================
-- 6. agent_messages
-- ============================================================
CREATE TABLE agent_messages (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_type                TEXT CHECK (user_type IN ('newsletter', 'business')),
  user_id                  UUID,
  phone                    TEXT NOT NULL,
  direction                TEXT CHECK (direction IN ('inbound', 'outbound')),
  message_type             TEXT CHECK (message_type IN (
                             'onboarding', 'match_suggestion', 'intro_request',
                             'follow_up', 'periodic_update', 'general'
                           )),
  content                  TEXT,
  whatsapp_message_id      TEXT,
  related_introduction_id  UUID,
  created_at               TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================

-- newsletter_profiles
CREATE INDEX idx_newsletters_niche        ON newsletter_profiles (primary_niche) WHERE is_active = true;
CREATE INDEX idx_newsletters_verification ON newsletter_profiles (verification_status) WHERE is_active = true;

-- business_profiles
CREATE INDEX idx_businesses_niche ON business_profiles (primary_niche) WHERE is_active = true;

-- introductions
CREATE INDEX idx_introductions_status     ON introductions (status);
CREATE INDEX idx_introductions_business   ON introductions (business_id);
CREATE INDEX idx_introductions_newsletter ON introductions (newsletter_id);

-- transactions
CREATE INDEX idx_transactions_status ON transactions (status);
CREATE INDEX idx_transactions_appeal ON transactions (appeal_deadline) WHERE status = 'appeal_window';

-- utm_clicks
CREATE INDEX idx_utm_clicks_slug ON utm_clicks (utm_slug);

-- agent_messages
CREATE INDEX idx_agent_messages_user ON agent_messages (user_id);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE newsletter_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE introductions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions        ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Storage Reminder
-- ============================================================
-- TODO: Create a PRIVATE Supabase Storage bucket named "proof-screenshots"
-- for storing newsletter placement proof images. This must be configured
-- via the Supabase dashboard or the storage API, not via SQL.
