-- ======================================================================
-- Avatar Storage — separate public bucket
-- ======================================================================
-- Avatars were being written to `proof-screenshots` (private bucket used
-- for verification screenshots). The route called `getPublicUrl()` which
-- returns a `/storage/v1/object/public/…` URL — but for private buckets
-- that URL pattern returns 400, so the avatar URL written to profiles
-- never actually loaded in browsers (latent feature bug since the
-- avatar feature shipped).
--
-- Fix: dedicated `avatars` bucket with public:true. Verify screenshots
-- (sensitive) stay in the private `proof-screenshots` bucket. Service
-- role still owns writes; anon gets read-only.
-- ======================================================================

BEGIN;

-- Create the bucket if missing. id = name keeps things simple.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5 * 1024 * 1024, -- 5MB cap, same as upload-avatar route
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read — anyone can view an avatar via the public URL.
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'avatars');

-- Writes: service role only (the route uses createServiceClient, which
-- bypasses RLS — explicit policy here is documentation, not enforcement).
DROP POLICY IF EXISTS "avatars_service_write" ON storage.objects;
CREATE POLICY "avatars_service_write"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'avatars')
  WITH CHECK (bucket_id = 'avatars');

COMMIT;
