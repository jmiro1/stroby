-- ======================================================================
-- Multi-platform matching, Phase F — match_decisions + graph FK widening
-- ======================================================================
-- match_decisions and creator_creator_substitutability had FKs pointing
-- exclusively to newsletter_profiles_all, which prevented logging
-- decisions about other_profiles creators (or computing substitutability
-- across both sources). UUIDs are globally unique, so dropping the FK
-- is safe — integrity is enforced at the app layer via the new
-- creator_type column.
--
-- Existing rows are all newsletter creators → backfill creator_type
-- defaults to 'newsletter' for them.
-- ======================================================================

BEGIN;

-- 1. match_decisions: drop FK, add creator_type
ALTER TABLE public.match_decisions
  DROP CONSTRAINT IF EXISTS match_decisions_creator_id_fkey;

ALTER TABLE public.match_decisions
  ADD COLUMN IF NOT EXISTS creator_type TEXT NOT NULL DEFAULT 'newsletter'
    CHECK (creator_type IN ('newsletter', 'other'));

-- All existing rows are newsletter (FK enforced it until just now). The
-- DEFAULT handles them; explicit UPDATE is a no-op but documents intent.
UPDATE public.match_decisions SET creator_type = 'newsletter' WHERE creator_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_match_decisions_creator_type
  ON public.match_decisions (creator_type);

-- 2. creator_creator_substitutability: drop FKs (substitutability across
-- newsletter and other is fine in principle; for v1 only newsletters
-- have data, but the table shouldn't refuse other-creator rows on FK
-- grounds when we get there).
ALTER TABLE public.creator_creator_substitutability
  DROP CONSTRAINT IF EXISTS creator_creator_substitutability_creator_a_id_fkey;
ALTER TABLE public.creator_creator_substitutability
  DROP CONSTRAINT IF EXISTS creator_creator_substitutability_creator_b_id_fkey;

COMMIT;
