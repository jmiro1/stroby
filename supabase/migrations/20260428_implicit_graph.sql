-- ======================================================================
-- Phase 5 — Implicit graph from closed deals
-- ======================================================================
-- Two collaborative-filtering tables:
--   1. brand_brand_similarity — two brands score high if they sponsored
--      overlapping creators. Cosine over creator-id sets.
--   2. creator_creator_substitutability — two creators are substitutes
--      if the same brands sponsored both. Cosine over brand-id sets.
--
-- Recomputed weekly by /api/jobs/run-matching (Sunday gate inside the
-- existing daily cron). The matching engine reads brand_brand_similarity
-- when it ranks creators for brand B — pulls B's top-N similar brands
-- and flags creators those brands successfully introduced as
-- "graph-recommended" in the rerank prompt.
--
-- The signal is GATED on >=30 completed introductions globally. Below
-- that threshold the matrix is too sparse to mean anything; rerank
-- prompt omits the graph block entirely. Activates automatically as
-- deal count grows.
-- ======================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.brand_brand_similarity (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_a_id            UUID NOT NULL REFERENCES public.business_profiles_all(id) ON DELETE CASCADE,
  brand_b_id            UUID NOT NULL REFERENCES public.business_profiles_all(id) ON DELETE CASCADE,
  cosine_score          NUMERIC(5,4) NOT NULL,
  shared_creator_count  INTEGER      NOT NULL,
  computed_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (brand_a_id, brand_b_id),
  CHECK (brand_a_id < brand_b_id)  -- canonical ordering — pairs stored once
);

CREATE INDEX IF NOT EXISTS idx_brand_similarity_a_score
  ON public.brand_brand_similarity (brand_a_id, cosine_score DESC);
CREATE INDEX IF NOT EXISTS idx_brand_similarity_b_score
  ON public.brand_brand_similarity (brand_b_id, cosine_score DESC);

COMMENT ON TABLE public.brand_brand_similarity IS
  'Pairwise brand similarity from collaborative-filtering over completed introductions. Cosine = |A∩B| / sqrt(|A|*|B|) where A,B are sets of creators each brand has sponsored. Recomputed weekly. Gated on >=30 completed deals before the matcher reads from it.';

CREATE TABLE IF NOT EXISTS public.creator_creator_substitutability (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_a_id        UUID NOT NULL REFERENCES public.newsletter_profiles_all(id) ON DELETE CASCADE,
  creator_b_id        UUID NOT NULL REFERENCES public.newsletter_profiles_all(id) ON DELETE CASCADE,
  cosine_score        NUMERIC(5,4) NOT NULL,
  shared_brand_count  INTEGER      NOT NULL,
  computed_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (creator_a_id, creator_b_id),
  CHECK (creator_a_id < creator_b_id)
);

CREATE INDEX IF NOT EXISTS idx_creator_substitutability_a_score
  ON public.creator_creator_substitutability (creator_a_id, cosine_score DESC);
CREATE INDEX IF NOT EXISTS idx_creator_substitutability_b_score
  ON public.creator_creator_substitutability (creator_b_id, cosine_score DESC);

COMMENT ON TABLE public.creator_creator_substitutability IS
  'Pairwise creator substitutability — two creators are substitutes if the same brands sponsored both. Cosine over brand-id sets. Used when a brand says NO to one creator, surface a similar one. Recomputed weekly. Gated on >=30 completed deals.';

-- RLS — service role only
ALTER TABLE public.brand_brand_similarity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_creator_substitutability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brand_similarity_service_only" ON public.brand_brand_similarity
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "creator_substitutability_service_only" ON public.creator_creator_substitutability
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
