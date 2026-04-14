"""
Embeddings module — generates and stores vector embeddings for matching.

Supports two backends:
  1. Voyage AI voyage-3-lite (1024 dims, zero-padded to 1536) — production quality
     Anthropic's recommended embedding partner. Free tier: 200M tokens.
  2. Local TF-IDF fallback (1536 dims) — for testing without API key

The embedding is generated from a "matching fingerprint" — a structured text
representation of the creator/brand profile that emphasizes audience, needs,
and psychographics over raw industry keywords.

This is what makes the matching audience/need-based instead of keyword-based:
we embed "who reads this" and "who they want to reach", not "what category".
"""
from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import re
from collections import Counter
from pathlib import Path
from typing import Optional

import httpx
import numpy as np

logger = logging.getLogger(__name__)

# Embedding config
EMBEDDING_DIM = 1024  # Voyage voyage-3-lite outputs 1024 dims; zero-padded to 1536 for pgvector
PGVECTOR_DIM = 1536
VOYAGE_MODEL = "voyage-3-lite"  # Free tier: 200M tokens. Upgrade to voyage-3 for best quality.

# Load keys — Voyage AI (Anthropic's recommended embedding partner)
VOYAGE_API_KEY = os.environ.get("VOYAGEAI_API_KEY", "")

if not VOYAGE_API_KEY:
    env_path = Path(__file__).parent.parent / ".env.local"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line.startswith("#"):
                continue
            if line.startswith("VOYAGEAI_API_KEY="):
                VOYAGE_API_KEY = line.split("=", 1)[1].strip()

# Supabase connection
SB_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SB_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not SB_KEY:
    env_path = Path(__file__).parent.parent / ".env.local"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
                SB_KEY = line.split("=", 1)[1].strip()
            elif line.startswith("NEXT_PUBLIC_SUPABASE_URL="):
                SB_URL = line.split("=", 1)[1].strip()


# ----------------------------------------------------------------- Matching fingerprints

def creator_fingerprint(intelligence: dict) -> str:
    """Generate a matching fingerprint text from a creator's content intelligence.

    This text is what gets embedded. It's designed to capture WHO reads this
    newsletter, not just what topics it covers.
    """
    synth = intelligence.get("synthesized", {})
    if not synth:
        return ""

    parts = []

    # Audience profile (most important for matching)
    audience = synth.get("audience_profile", {})
    if audience.get("likely_profession"):
        parts.append(f"Readers are {audience['likely_profession']}")
    if audience.get("likely_seniority"):
        parts.append(f"at {audience['likely_seniority']} level")
    if audience.get("top_interests"):
        parts.append(f"interested in {', '.join(audience['top_interests'][:5])}")

    # One-line profile
    if synth.get("one_line_profile"):
        parts.append(synth["one_line_profile"])

    # Topics (secondary — topics hint at audience interests)
    if synth.get("top_topics"):
        parts.append(f"Topics covered: {', '.join(synth['top_topics'][:6])}")

    # Content category
    if synth.get("content_category"):
        parts.append(f"Category: {synth['content_category']}")

    # Writing style and tone (matters for brand voice matching)
    if synth.get("writing_style"):
        parts.append(f"Writing style: {synth['writing_style']}")

    # Advertiser friendliness
    af = synth.get("advertiser_friendliness")
    if af is not None:
        if af >= 8:
            parts.append("Very advertiser-friendly content")
        elif af >= 6:
            parts.append("Moderately advertiser-friendly")
        elif af < 4:
            parts.append("Edgy or controversial content")

    return ". ".join(parts)


def brand_fingerprint(intelligence: dict) -> str:
    """Generate a matching fingerprint text from a brand's intelligence profile.

    Designed to capture WHO they want to reach — their ideal reader/customer.
    """
    synth = intelligence.get("synthesized", {})
    if not synth:
        return ""

    parts = []

    # Ideal audience (most important)
    if synth.get("ideal_audience"):
        parts.append(f"Wants to reach: {synth['ideal_audience']}")

    # Target profile
    target = synth.get("target_profile", {})
    if target.get("profession"):
        parts.append(f"Target profession: {target['profession']}")
    if target.get("seniority"):
        parts.append(f"Target seniority: {target['seniority']}")
    if target.get("income_bracket"):
        parts.append(f"Target income: {target['income_bracket']}")
    if target.get("psychographic"):
        parts.append(f"Buyer psychographic: {target['psychographic']}")
    if target.get("pain_points"):
        parts.append(f"Pain points: {', '.join(target['pain_points'][:4])}")

    # Content affinity
    if synth.get("content_affinity"):
        parts.append(f"Content themes: {', '.join(synth['content_affinity'][:6])}")

    # Product category
    if synth.get("product_category"):
        parts.append(f"Product: {synth['product_category']}")

    # Brand voice
    if synth.get("brand_voice"):
        parts.append(f"Brand voice: {synth['brand_voice']}")

    # One-line need
    if synth.get("one_line_need"):
        parts.append(synth["one_line_need"])

    # Newsletter fit
    if synth.get("newsletter_fit"):
        parts.append(f"Newsletter fit: {synth['newsletter_fit']}")

    return ". ".join(parts)


# ----------------------------------------------------------------- Embedding backends

def _embed_voyage(texts: list[str]) -> list[list[float]]:
    """Generate embeddings via Voyage AI (Anthropic's recommended partner).

    Uses voyage-3-lite (1024 dims). Zero-pads to 1536 to fit the pgvector column.
    Free tier: 200M tokens — more than enough for matching profiles.
    """
    import voyageai
    vo = voyageai.Client(api_key=VOYAGE_API_KEY)

    result = vo.embed(texts, model=VOYAGE_MODEL, input_type="document")
    embeddings = result.embeddings

    # Zero-pad to PGVECTOR_DIM if needed
    padded = []
    for emb in embeddings:
        if len(emb) < PGVECTOR_DIM:
            emb = emb + [0.0] * (PGVECTOR_DIM - len(emb))
        padded.append(emb)

    return padded


def _embed_tfidf(texts: list[str]) -> list[list[float]]:
    """Local TF-IDF fallback — no API key needed.

    Produces 1536-dim vectors via feature hashing. Not as good as neural
    embeddings but adequate for testing the matching pipeline.
    """
    results = []
    for text in texts:
        # Tokenize
        words = re.findall(r'[a-z]+', text.lower())
        # Bigrams for richer representation
        bigrams = [f"{words[i]}_{words[i+1]}" for i in range(len(words)-1)]
        tokens = words + bigrams

        # Feature hashing into PGVECTOR_DIM dimensions
        vec = np.zeros(PGVECTOR_DIM, dtype=np.float32)
        counts = Counter(tokens)
        for token, count in counts.items():
            # Hash to a dimension
            h = int(hashlib.md5(token.encode()).hexdigest(), 16)
            idx = h % PGVECTOR_DIM
            sign = 1 if (h // PGVECTOR_DIM) % 2 == 0 else -1
            # TF-IDF-ish: log(1 + count) * sign
            vec[idx] += sign * math.log1p(count)

        # L2 normalize
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm

        results.append(vec.tolist())

    return results


def embed(texts: list[str]) -> list[list[float]]:
    """Generate embeddings using the best available backend.

    Priority: Voyage AI (neural) > TF-IDF (local fallback)
    """
    if VOYAGE_API_KEY:
        logger.info(f"embeddings: using Voyage AI ({VOYAGE_MODEL}) for {len(texts)} texts")
        return _embed_voyage(texts)
    else:
        logger.info(f"embeddings: using TF-IDF fallback for {len(texts)} texts (set VOYAGEAI_API_KEY for production quality)")
        return _embed_tfidf(texts)


def embed_single(text: str) -> list[float]:
    """Generate a single embedding."""
    return embed([text])[0]


# ----------------------------------------------------------------- Supabase storage

def _supabase_patch(path: str, data: dict) -> dict:
    resp = httpx.patch(
        f"{SB_URL}/rest/v1/{path}",
        json=data,
        headers={
            "apikey": SB_KEY,
            "Authorization": f"Bearer {SB_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def _supabase_get(path: str, params: dict = None) -> list[dict]:
    resp = httpx.get(
        f"{SB_URL}/rest/v1/{path}",
        params=params or {},
        headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def store_creator_embedding(creator_id: str, embedding: list[float]):
    """Store a creator's embedding in Supabase."""
    # pgvector expects a string like '[0.1, 0.2, ...]'
    vec_str = "[" + ",".join(str(x) for x in embedding) + "]"
    _supabase_patch(
        f"newsletter_profiles?id=eq.{creator_id}",
        {"profile_embedding": vec_str},
    )
    logger.info(f"embeddings: stored creator embedding for {creator_id}")


def store_brand_embedding(brand_id: str, embedding: list[float]):
    """Store a brand's embedding in Supabase."""
    vec_str = "[" + ",".join(str(x) for x in embedding) + "]"
    _supabase_patch(
        f"business_profiles?id=eq.{brand_id}",
        {"profile_embedding": vec_str},
    )
    logger.info(f"embeddings: stored brand embedding for {brand_id}")


# ----------------------------------------------------------------- Batch operations

def embed_all_creators():
    """Generate and store embeddings for all creators with content intelligence."""
    from content_intelligence import get_signed_up_creators

    creators = get_signed_up_creators()
    updated = 0

    for creator in creators:
        intel = creator.get("content_intelligence")
        if not intel:
            continue
        if isinstance(intel, str):
            try:
                intel = json.loads(intel)
            except json.JSONDecodeError:
                continue

        fingerprint = creator_fingerprint(intel)
        if not fingerprint:
            continue

        embedding = embed_single(fingerprint)
        store_creator_embedding(creator["id"], embedding)
        updated += 1
        logger.info(f"  embedded creator: {creator.get('newsletter_name', '?')} — {fingerprint[:80]}...")

    logger.info(f"embeddings: embedded {updated} creators")
    return updated


def embed_all_brands():
    """Generate and store embeddings for all brands with brand intelligence."""
    from brand_intelligence import get_all_brands

    brands = get_all_brands()
    updated = 0

    for brand in brands:
        intel = brand.get("brand_intelligence")
        if not intel:
            continue
        if isinstance(intel, str):
            try:
                intel = json.loads(intel)
            except json.JSONDecodeError:
                continue

        fingerprint = brand_fingerprint(intel)
        if not fingerprint:
            continue

        embedding = embed_single(fingerprint)
        store_brand_embedding(brand["id"], embedding)
        updated += 1
        logger.info(f"  embedded brand: {brand.get('company_name', '?')} — {fingerprint[:80]}...")

    logger.info(f"embeddings: embedded {updated} brands")
    return updated


# ----------------------------------------------------------------- CLI

if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO)

    if len(sys.argv) > 1 and sys.argv[1] == "all":
        print("Embedding all profiles...")
        c = embed_all_creators()
        b = embed_all_brands()
        print(f"Done: {c} creators, {b} brands")
    elif len(sys.argv) > 1 and sys.argv[1] == "test":
        # Test with sample texts
        texts = [
            "Senior product managers at B2B SaaS companies interested in PLG strategy",
            "Maintenance managers at manufacturing plants who need thermal inspection tools",
            "Travel brand looking for finance professionals with disposable income",
        ]
        embeddings = embed(texts)
        # Show cosine similarity between pairs
        for i in range(len(texts)):
            for j in range(i+1, len(texts)):
                a = np.array(embeddings[i])
                b = np.array(embeddings[j])
                sim = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))
                print(f"Similarity ({texts[i][:40]}... vs {texts[j][:40]}...): {sim:.3f}")
    else:
        print("Usage:")
        print("  python embeddings.py all   — embed all creators + brands")
        print("  python embeddings.py test  — test similarity with sample texts")
