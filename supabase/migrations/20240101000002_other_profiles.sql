-- ============================================================
-- other_profiles — for users who don't fit business/influencer
-- ============================================================
CREATE TABLE other_profiles (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  email                TEXT UNIQUE,
  phone                TEXT,
  role                 TEXT,
  organization         TEXT,
  location             TEXT,
  description          TEXT,
  objectives           TEXT,
  looking_for          TEXT,
  can_offer            TEXT,
  niche                TEXT,
  website              TEXT,
  linkedin             TEXT,
  avg_match_rating     DECIMAL(3,2) DEFAULT 0,
  total_deals          INTEGER DEFAULT 0,
  is_active            BOOLEAN DEFAULT true,
  onboarding_status    TEXT DEFAULT 'widget_complete',
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER set_other_profiles_updated_at
  BEFORE UPDATE ON other_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_other_profiles_niche ON other_profiles(niche);
CREATE INDEX idx_other_profiles_location ON other_profiles(location);
CREATE INDEX idx_other_profiles_is_active ON other_profiles(is_active);

-- Enable RLS
ALTER TABLE other_profiles ENABLE ROW LEVEL SECURITY;

-- Service role can do anything
CREATE POLICY "Service role full access on other_profiles"
  ON other_profiles FOR ALL
  USING (true)
  WITH CHECK (true);
