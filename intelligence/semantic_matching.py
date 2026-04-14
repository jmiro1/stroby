"""
Semantic Matching Engine — Layer 3 of the Stroby matching moat.

Matches creators to brands using vector similarity on audience/need profiles,
NOT industry keywords. A travel brand can match a finance newsletter if the
readers have disposable income. A dev tools brand can match a leadership
newsletter if the readers manage engineering teams.

Match score formula:
  0.50 * cosine_similarity(creator_embedding, brand_embedding)
  0.15 * audience_size_fit(creator_subs, brand_budget)
  0.10 * advertiser_friendliness / 10
  0.10 * content_consistency
  0.10 * income_bracket_match(creator_audience, brand_target)
  0.05 * competitor_signal(brand, creator)

Each match includes a human-readable explanation so William can use it
in outreach and the Stroby app can display it to users.
"""
from __future__ import annotations

import json
import logging
import subprocess
from pathlib import Path
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

CLAUDE_BIN = Path.home() / ".local" / "bin" / "claude"

# ----------------------------------------------------------------- Score helpers

INCOME_BRACKETS = {
    "unknown": 0,
    "$30k-$60k": 45_000,
    "$40k-$80k": 60_000,
    "$50k-$80k": 65_000,
    "$60k-$120k": 90_000,
    "$80k-$150k": 115_000,
    "$100k-$200k": 150_000,
    "$120k-$200k": 160_000,
    "$120k-$250k": 185_000,
    "$150k+": 200_000,
    "$200k+": 250_000,
}

# ── Industry-aware value-per-subscriber model ──
#
# The value of a subscriber varies 100x+ across industries:
#   - A 2,000-sub newsletter of Fortune 500 CFOs → $50-200 CPM for a wealth mgmt brand
#   - A 200,000-sub meme page → $2-5 CPM for a consumer brand
#   - A 500-sub newsletter of CIOs → priceless for an enterprise SaaS brand
#
# We classify brands into value tiers based on their product/budget signals,
# then adjust the ideal subscriber range accordingly.

VALUE_TIERS = {
    # tier_name: (min_subs, max_subs, effective_cpm_range, description)
    # These are the ideal subscriber ranges per budget level for this tier.
    "ultra_high_ticket": {
        # Enterprise SaaS ($50k-$500k ACV), wealth management, private banking,
        # commercial real estate, M&A advisory, executive recruiting, luxury real estate
        # A single conversion = $50k-$500k+. Even 500 subs can be worth $5k+/placement.
        "budget_ranges": {
            "<500":       (200, 5_000),
            "500-1000":   (500, 10_000),
            "1000-2500":  (1_000, 25_000),
            "2500-5000":  (2_000, 50_000),
            "5000+":      (5_000, 100_000),
        },
        "keywords": ["enterprise", "wealth management", "private equity", "venture capital",
                     "commercial real estate", "M&A", "executive", "C-suite", "fortune 500",
                     "institutional", "family office", "hedge fund", "investment banking",
                     "consulting", "advisory"],
    },
    "high_ticket": {
        # Mid-market SaaS ($5k-$50k ACV), professional services, luxury goods,
        # premium travel, high-end coaching, fintech for HNW individuals
        # A single conversion = $5k-$50k. 1,000-2,000 subs can be very profitable.
        "budget_ranges": {
            "<500":       (500, 10_000),
            "500-1000":   (1_000, 20_000),
            "1000-2500":  (2_000, 50_000),
            "2500-5000":  (5_000, 100_000),
            "5000+":      (10_000, 200_000),
        },
        "keywords": ["SaaS", "B2B", "premium", "luxury", "high-end", "professional services",
                     "fintech", "legal tech", "medical device", "industrial equipment",
                     "thermal", "inspection", "manufacturing", "enterprise software",
                     "cybersecurity", "compliance", "analytics platform"],
    },
    "mid_ticket": {
        # SMB SaaS ($500-$5k ACV), education/courses, mid-range DTC, supplements,
        # fitness, premium subscriptions, financial tools
        # A single conversion = $500-$5k. Need 5k-20k subs to be efficient.
        "budget_ranges": {
            "<500":       (2_000, 20_000),
            "500-1000":   (5_000, 40_000),
            "1000-2500":  (8_000, 75_000),
            "2500-5000":  (15_000, 150_000),
            "5000+":      (30_000, 300_000),
        },
        "keywords": ["course", "coaching", "education", "supplements", "fitness",
                     "DTC", "direct-to-consumer", "subscription", "productivity tool",
                     "design tool", "developer tool", "freelancer", "creator economy"],
    },
    "volume_play": {
        # Consumer apps, mobile games, fast fashion, CPG, media/content,
        # low-priced products, ad-supported platforms
        # A single conversion = $1-$500. Need 50k+ subs for meaningful ROI.
        "budget_ranges": {
            "<500":       (5_000, 50_000),
            "500-1000":   (10_000, 75_000),
            "1000-2500":  (25_000, 150_000),
            "2500-5000":  (50_000, 300_000),
            "5000+":      (100_000, 500_000),
        },
        "keywords": ["consumer", "app", "mobile", "game", "fashion", "beauty",
                     "food", "beverage", "CPG", "entertainment", "media",
                     "news", "lifestyle", "shopping", "marketplace"],
    },
}

# Fallback if we can't determine the tier
DEFAULT_BUDGET_RANGES = {
    "<500":       (1_000, 15_000),
    "500-1000":   (3_000, 30_000),
    "1000-2500":  (8_000, 75_000),
    "2500-5000":  (20_000, 150_000),
    "5000+":      (50_000, 500_000),
}


def _classify_value_tier(brand_intel: dict) -> str:
    """Classify a brand into a value tier based on their intelligence profile.

    Uses product category, budget signals, and target customer to determine
    whether this is an ultra-high-ticket play (small lists fine) or a volume
    play (need large audiences).
    """
    synth = brand_intel.get("synthesized", {})
    if not synth:
        return "mid_ticket"  # default

    # Build a text blob from all relevant fields
    signals = " ".join([
        synth.get("product_category", ""),
        synth.get("ideal_audience", ""),
        synth.get("budget_signal", ""),
        synth.get("one_line_need", ""),
        synth.get("newsletter_fit", ""),
        " ".join(synth.get("content_affinity", [])),
        synth.get("target_profile", {}).get("psychographic", ""),
        synth.get("target_profile", {}).get("company_size", ""),
    ]).lower()

    # Score each tier by keyword matches
    best_tier = "mid_ticket"
    best_score = 0

    for tier_name, tier_data in VALUE_TIERS.items():
        score = sum(1 for kw in tier_data["keywords"] if kw in signals)
        # Budget signal boosters
        budget_sig = synth.get("budget_signal", "").lower()
        if tier_name == "ultra_high_ticket" and budget_sig in ("enterprise", "growth"):
            score += 3
        elif tier_name == "high_ticket" and budget_sig in ("series-a-b", "growth"):
            score += 2
        elif tier_name == "volume_play" and budget_sig in ("bootstrapped", "seed"):
            score += 1  # small budget = might still be high-ticket if niche

        # Income bracket boosters
        income = synth.get("target_profile", {}).get("income_bracket", "")
        if income in ("$150k+", "$200k+") and tier_name in ("ultra_high_ticket", "high_ticket"):
            score += 2
        elif income in ("$60k-$120k", "$80k-$150k") and tier_name == "mid_ticket":
            score += 1

        if score > best_score:
            best_score = score
            best_tier = tier_name

    return best_tier


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Cosine similarity between two vectors."""
    a_arr = np.array(a, dtype=np.float32)
    b_arr = np.array(b, dtype=np.float32)
    dot = float(np.dot(a_arr, b_arr))
    norm = float(np.linalg.norm(a_arr) * np.linalg.norm(b_arr))
    if norm == 0:
        return 0.0
    return dot / norm


def _audience_size_fit(subscriber_count: int, budget_range: str, brand_intel: dict = None) -> float:
    """Score 0-1: how well does the creator's audience size fit this brand's needs?

    Industry-aware: a $500/mo enterprise SaaS brand can profitably sponsor a
    2,000-sub newsletter of CTOs. A $500/mo consumer app needs 50k+ subs.
    The value tier (from brand intelligence) determines the ideal subscriber range.
    """
    if not subscriber_count or not budget_range:
        return 0.5  # neutral if unknown

    # Determine value tier and get appropriate subscriber ranges
    if brand_intel:
        tier = _classify_value_tier(brand_intel)
        tier_ranges = VALUE_TIERS.get(tier, {}).get("budget_ranges", DEFAULT_BUDGET_RANGES)
    else:
        tier_ranges = DEFAULT_BUDGET_RANGES

    ideal_min, ideal_max = tier_ranges.get(budget_range, (5_000, 100_000))

    if ideal_min <= subscriber_count <= ideal_max:
        return 1.0
    elif subscriber_count < ideal_min:
        # Too small — proportional penalty
        ratio = subscriber_count / ideal_min
        return max(ratio, 0.1)
    else:
        # Too big — milder penalty (big audience is still valuable, just less efficient)
        ratio = ideal_max / subscriber_count
        return max(ratio, 0.3)


def _income_match(creator_income: str, brand_income: str) -> float:
    """Score 0-1: how well does the creator's audience income match the brand's target?

    If the brand targets $150k+ earners and the newsletter readers earn $40k-$80k,
    that's a bad match. If both are $120k+, that's great.
    """
    c_val = INCOME_BRACKETS.get(creator_income, 0)
    b_val = INCOME_BRACKETS.get(brand_income, 0)

    if c_val == 0 or b_val == 0:
        return 0.5  # neutral if unknown

    # Perfect match if within 30% of each other
    ratio = min(c_val, b_val) / max(c_val, b_val)
    if ratio >= 0.7:
        return 1.0
    elif ratio >= 0.4:
        return 0.6
    else:
        return 0.2


# ----------------------------------------------------------------- Match scoring

def score_match(creator: dict, brand: dict) -> dict:
    """Score a creator-brand match and generate an explanation.

    Returns:
    {
      "score": 0.0-1.0,
      "components": {component: value, ...},
      "explanation": "human-readable why this is a good match"
    }
    """
    # Extract data
    creator_intel = creator.get("content_intelligence", {})
    brand_intel = brand.get("brand_intelligence", {})
    if isinstance(creator_intel, str):
        try:
            creator_intel = json.loads(creator_intel)
        except json.JSONDecodeError:
            creator_intel = {}
    if isinstance(brand_intel, str):
        try:
            brand_intel = json.loads(brand_intel)
        except json.JSONDecodeError:
            brand_intel = {}

    creator_synth = creator_intel.get("synthesized", {})
    brand_synth = brand_intel.get("synthesized", {})

    # Component 1: Cosine similarity (0.50 weight)
    creator_emb = creator.get("profile_embedding")
    brand_emb = brand.get("profile_embedding")
    if creator_emb and brand_emb:
        # Parse if string
        if isinstance(creator_emb, str):
            creator_emb = json.loads(creator_emb)
        if isinstance(brand_emb, str):
            brand_emb = json.loads(brand_emb)
        cos_sim = max(_cosine_similarity(creator_emb, brand_emb), 0)
    else:
        cos_sim = 0.0

    # Component 2: Audience size fit (0.15 weight) — industry-aware
    sub_count = creator.get("subscriber_count") or 0
    budget = brand.get("budget_range", "")
    size_fit = _audience_size_fit(sub_count, budget, brand_intel)

    # Component 3: Advertiser friendliness (0.10 weight)
    af = creator_synth.get("advertiser_friendliness", 5)
    af_score = min(af / 10, 1.0) if isinstance(af, (int, float)) else 0.5

    # Component 4: Content consistency (0.10 weight)
    consistency = creator_synth.get("content_consistency")
    consistency_score = consistency if consistency is not None else 0.5

    # Component 5: Income match (0.10 weight)
    creator_income = creator_synth.get("audience_profile", {}).get("likely_income_bracket", "unknown") if creator_synth.get("audience_profile") else "unknown"
    brand_income = brand_synth.get("target_profile", {}).get("income_bracket", "unknown") if brand_synth.get("target_profile") else "unknown"
    income = _income_match(creator_income, brand_income)

    # Component 6: Competitor signal (0.05 weight)
    try:
        from competitive_intel import get_competitor_signal
        comp_signal = get_competitor_signal(brand["id"], creator["id"])
    except Exception:
        comp_signal = 0.0

    # Weighted total
    total = (
        0.50 * cos_sim
        + 0.15 * size_fit
        + 0.10 * af_score
        + 0.10 * consistency_score
        + 0.10 * income
        + 0.05 * comp_signal
    )

    components = {
        "cosine_similarity": round(cos_sim, 3),
        "audience_size_fit": round(size_fit, 3),
        "advertiser_friendliness": round(af_score, 3),
        "content_consistency": round(consistency_score, 3),
        "income_match": round(income, 3),
        "competitor_signal": round(comp_signal, 3),
    }

    # Determine value tier for transparency
    value_tier = _classify_value_tier(brand_intel) if brand_intel else "unknown"

    # Generate explanation
    explanation = _build_explanation(
        creator, brand, total, components, creator_synth, brand_synth
    )

    return {
        "score": round(total, 3),
        "components": components,
        "value_tier": value_tier,
        "explanation": explanation,
    }


def _build_explanation(
    creator: dict, brand: dict, score: float, components: dict,
    creator_synth: dict, brand_synth: dict
) -> str:
    """Build a human-readable explanation of why this is a good (or bad) match."""
    creator_name = creator.get("newsletter_name", "This creator")
    brand_name = brand.get("company_name", "This brand")

    parts = [f"{int(score * 100)}% match"]

    # Audience alignment (main driver)
    creator_audience = creator_synth.get("one_line_profile", "")
    brand_audience = brand_synth.get("ideal_audience", "")
    if creator_audience and brand_audience:
        parts.append(f"{creator_name}'s audience ({creator_audience}) aligns with {brand_name}'s target ({brand_audience})")

    # Highlight strong components
    if components["audience_size_fit"] >= 0.8:
        parts.append("Audience size matches budget well")
    elif components["audience_size_fit"] < 0.4:
        parts.append("Audience size may not fit budget")

    if components["advertiser_friendliness"] >= 0.8:
        parts.append("Brand-safe content")

    if components["competitor_signal"] > 0:
        parts.append("Competitors already sponsor similar creators")

    if components["income_match"] >= 0.8:
        parts.append("Audience income bracket matches target")
    elif components["income_match"] < 0.4:
        parts.append("Audience income may not match target")

    # Shared themes
    creator_topics = set(creator_synth.get("top_topics", []))
    brand_themes = set(brand_synth.get("content_affinity", []))
    shared = creator_topics & brand_themes
    if shared:
        parts.append(f"Shared themes: {', '.join(list(shared)[:3])}")

    return " — ".join(parts)


# ----------------------------------------------------------------- Match queries

def get_matches_for_brand(brand_id: str, limit: int = 20) -> list[dict]:
    """Find the best creator matches for a brand.

    Returns top N creators ranked by match score, each with score + explanation.
    """
    from brand_intelligence import get_brand, _supabase_get
    from content_intelligence import get_signed_up_creators

    brand = get_brand(brand_id)
    if not brand:
        return []

    # Get all creators with embeddings
    creators = _supabase_get(
        "newsletter_profiles",
        {"select": "id,newsletter_name,email,url,primary_niche,subscriber_count,content_intelligence,profile_embedding",
         "is_active": "eq.true",
         "profile_embedding": "not.is.null"},
    )

    if not creators:
        logger.info("semantic_matching: no creators with embeddings found")
        return []

    # Score each creator against this brand
    matches = []
    for creator in creators:
        result = score_match(creator, brand)
        matches.append({
            "creator_id": creator["id"],
            "creator_name": creator.get("newsletter_name", "Unknown"),
            "subscriber_count": creator.get("subscriber_count"),
            "primary_niche": creator.get("primary_niche"),
            **result,
        })

    # Sort by score descending
    matches.sort(key=lambda m: -m["score"])
    return matches[:limit]


def get_matches_for_creator(creator_id: str, limit: int = 20) -> list[dict]:
    """Find the best brand matches for a creator.

    Returns top N brands ranked by match score, each with score + explanation.
    """
    from brand_intelligence import _supabase_get

    # Get the creator
    creators = _supabase_get(
        "newsletter_profiles",
        {"select": "id,newsletter_name,email,url,primary_niche,subscriber_count,content_intelligence,profile_embedding",
         "id": f"eq.{creator_id}",
         "is_active": "eq.true"},
    )
    if not creators:
        return []
    creator = creators[0]

    # Get all brands with embeddings
    brands = _supabase_get(
        "business_profiles",
        {"select": "id,company_name,product_description,target_customer,primary_niche,budget_range,brand_intelligence,profile_embedding",
         "is_active": "eq.true",
         "profile_embedding": "not.is.null"},
    )

    if not brands:
        logger.info("semantic_matching: no brands with embeddings found")
        return []

    # Score each brand against this creator
    matches = []
    for brand in brands:
        result = score_match(creator, brand)
        matches.append({
            "brand_id": brand["id"],
            "brand_name": brand.get("company_name", "Unknown"),
            "budget_range": brand.get("budget_range"),
            "primary_niche": brand.get("primary_niche"),
            **result,
        })

    matches.sort(key=lambda m: -m["score"])
    return matches[:limit]


# ----------------------------------------------------------------- Explanation generation (optional: rich Claude explanation)

def generate_rich_explanation(creator: dict, brand: dict, match_result: dict) -> str:
    """Use Claude to generate a rich, human explanation of why this match works.

    Only called on-demand (expensive per call), not during batch matching.
    """
    creator_intel = creator.get("content_intelligence", {})
    brand_intel = brand.get("brand_intelligence", {})
    if isinstance(creator_intel, str):
        creator_intel = json.loads(creator_intel)
    if isinstance(brand_intel, str):
        brand_intel = json.loads(brand_intel)

    prompt = f"""You're Stroby's matching engine. Explain in 2-3 sentences why this creator-brand match works (or doesn't).

Creator: {creator.get('newsletter_name', '?')}
Creator audience: {json.dumps(creator_intel.get('synthesized', {}), indent=2)[:500]}

Brand: {brand.get('company_name', '?')}
Brand needs: {json.dumps(brand_intel.get('synthesized', {}), indent=2)[:500]}

Match score: {match_result['score']} ({int(match_result['score'] * 100)}%)
Score breakdown: {json.dumps(match_result['components'])}

Write a concise, specific explanation. Focus on WHY the audiences align (or don't), not generic statements. Reference specific traits."""

    try:
        result = subprocess.run(
            [str(CLAUDE_BIN), "--print", "--no-session-persistence",
             "--model", "claude-haiku-4-5",
             "--",  # Separator: everything after is positional, not flags
             prompt],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception as e:
        logger.warning(f"Rich explanation failed: {e}")

    return match_result.get("explanation", "")


# ----------------------------------------------------------------- CLI

if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO)

    if len(sys.argv) > 2 and sys.argv[1] == "brand":
        brand_id = sys.argv[2]
        matches = get_matches_for_brand(brand_id)
        print(f"\nTop matches for brand {brand_id}:")
        for m in matches:
            print(f"  {m['score']:.0%} — {m['creator_name']} ({m.get('subscriber_count', '?')} subs)")
            print(f"       {m['explanation']}")
            print()
    elif len(sys.argv) > 2 and sys.argv[1] == "creator":
        creator_id = sys.argv[2]
        matches = get_matches_for_creator(creator_id)
        print(f"\nTop matches for creator {creator_id}:")
        for m in matches:
            print(f"  {m['score']:.0%} — {m['brand_name']} (budget: {m.get('budget_range', '?')})")
            print(f"       {m['explanation']}")
            print()
    else:
        print("Usage:")
        print("  python semantic_matching.py brand <brand_id>   — find creators for a brand")
        print("  python semantic_matching.py creator <creator_id> — find brands for a creator")
