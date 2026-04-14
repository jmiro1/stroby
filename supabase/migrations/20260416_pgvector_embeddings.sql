-- Layer 3: Semantic Matching — pgvector embeddings
-- Uses OpenAI text-embedding-3-small (1536 dimensions)

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Creator embedding (from synthesized content intelligence profile)
ALTER TABLE newsletter_profiles
  ADD COLUMN IF NOT EXISTS profile_embedding vector(1536);

-- Brand embedding (from synthesized brand intelligence profile)
ALTER TABLE business_profiles
  ADD COLUMN IF NOT EXISTS profile_embedding vector(1536);

-- Index for fast similarity search
CREATE INDEX IF NOT EXISTS newsletter_embedding_idx
  ON newsletter_profiles USING ivfflat (profile_embedding vector_cosine_ops)
  WITH (lists = 50);

CREATE INDEX IF NOT EXISTS business_embedding_idx
  ON business_profiles USING ivfflat (profile_embedding vector_cosine_ops)
  WITH (lists = 50);
