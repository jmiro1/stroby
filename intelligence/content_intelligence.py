"""
Content Intelligence Engine — Layer 1 of the Stroby matching moat.

ONLY for signed-up Stroby creators. When a creator signs up, this module
starts analyzing every newsletter issue they publish. Each issue enriches
their Creator Intelligence Profile, making their matches better over time.

The creator is told during onboarding: "I'll start reading your newsletters
to deeply understand your audience — your matches will keep getting better."

Flow:
  1. Echo listener receives a newsletter issue
  2. This module checks: is the sender a signed-up Stroby creator?
  3. If yes → extract structured intelligence via Haiku
  4. Accumulate in Supabase's newsletter_profiles.content_intelligence JSONB
  5. Re-synthesize the overall profile after each new issue
  6. Generate vector embedding for semantic matching (future)

NOT for outreach leads. NOT for scraped creators. ONLY for people who
signed up for Stroby and opted into content analysis.
"""
from __future__ import annotations

import json
import logging
import os
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

CLAUDE_BIN = Path.home() / ".local" / "bin" / "claude"

# Supabase connection
SB_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SB_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# Load from .env.local if not in environment
if not SB_KEY:
    env_path = Path(__file__).parent.parent / ".env.local"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
                SB_KEY = line.split("=", 1)[1].strip()
            elif line.startswith("NEXT_PUBLIC_SUPABASE_URL="):
                SB_URL = line.split("=", 1)[1].strip()


EXTRACTION_PROMPT = """You are analyzing a newsletter issue to build a creator intelligence profile for Stroby's matching engine. Extract structured data that helps match this creator with the RIGHT brand sponsors.

Be SPECIFIC. "Business" is useless. "Bootstrapped SaaS growth tactics for solo founders making $10k-$100k MRR" is gold.

Return STRICT JSON:
{
  "topics": ["topic 1", "topic 2", "topic 3"],
  "audience_signals": {
    "likely_profession": "e.g. product managers, indie hackers, marketing directors",
    "likely_seniority": "e.g. mid-career, senior, executive, early-career",
    "likely_interests": ["interest 1", "interest 2"],
    "likely_income_bracket": "e.g. $80k-$150k, $150k+, unknown"
  },
  "writing_style": "casual | formal | technical | conversational | edgy | academic",
  "advertiser_friendliness": 7,
  "sponsor_mentions": ["brand names already mentioned or sponsoring"],
  "content_category": "specific category — NOT generic. e.g. 'indie game dev' not 'gaming'",
  "audience_intent": "learning | entertainment | professional_development | news | lifestyle | opinion",
  "key_themes": ["recurring theme 1", "theme 2"],
  "notable_quotes": ["one short quote that reveals the creator's voice"]
}

Return ONLY the JSON. No markdown, no explanation."""


def _supabase_get(path: str, params: dict = None) -> list[dict]:
    """GET from Supabase REST API."""
    resp = httpx.get(
        f"{SB_URL}/rest/v1/{path}",
        params=params or {},
        headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def _supabase_patch(path: str, data: dict) -> dict:
    """PATCH Supabase REST API."""
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


def get_signed_up_creators() -> list[dict]:
    """Get all newsletter creators who signed up for Stroby."""
    return _supabase_get(
        "newsletter_profiles",
        {"select": "id,newsletter_name,email,url,phone,primary_niche,subscriber_count,content_intelligence",
         "is_active": "eq.true"},
    )


def is_signed_up_creator(sender_email: str, publication_url: str = "") -> Optional[dict]:
    """Check if a newsletter sender is a signed-up Stroby creator.

    Matches by email or URL. Returns the creator profile or None.
    """
    # Try matching by email
    if sender_email:
        results = _supabase_get(
            "newsletter_profiles",
            {"select": "id,newsletter_name,email,url,content_intelligence",
             "email": f"eq.{sender_email}",
             "is_active": "eq.true"},
        )
        if results:
            return results[0]

    # Try matching by URL
    if publication_url:
        results = _supabase_get(
            "newsletter_profiles",
            {"select": "id,newsletter_name,email,url,content_intelligence",
             "url": f"eq.{publication_url}",
             "is_active": "eq.true"},
        )
        if results:
            return results[0]

    return None


def analyze_issue(issue_text: str, creator_name: str = "") -> Optional[dict]:
    """Extract structured intelligence from a single newsletter issue via Haiku."""
    if not issue_text or len(issue_text.strip()) < 100:
        return None

    # Truncate to keep Haiku cost low
    text = issue_text[:6000]

    user_prompt = f"Creator: {creator_name}\n\nNewsletter issue:\n\n{text}"

    try:
        result = subprocess.run(
            [str(CLAUDE_BIN), "--print", "--no-session-persistence",
             "--tools", "",
             "--model", "claude-haiku-4-5",
             "--system-prompt", EXTRACTION_PROMPT,
             "--output-format", "json",
             "--",  # Separator: everything after is positional, not flags
             user_prompt],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode == 0:
            outer = json.loads(result.stdout)
            raw_text = outer.get("result", "")
            # Parse the JSON from the response
            # Try to find JSON in the response
            try:
                return json.loads(raw_text)
            except json.JSONDecodeError:
                # Try extracting JSON from markdown code block
                import re
                match = re.search(r'\{[\s\S]*\}', raw_text)
                if match:
                    return json.loads(match.group())
    except Exception as e:
        logger.warning(f"content_intelligence: Haiku extraction failed: {e}")

    return None


def update_creator_intelligence(creator_id: str, new_analysis: dict) -> dict:
    """Accumulate a new issue analysis into the creator's intelligence profile.

    The content_intelligence JSONB field stores:
    {
      "issue_analyses": [{date, topics, ...}, ...],  // per-issue extractions
      "synthesized": {                                // overall profile
        "top_topics": [...],
        "audience_profile": {...},
        "writing_style": "...",
        ...
      },
      "issues_analyzed": N,
      "last_analyzed_at": "..."
    }
    """
    # Fetch current intelligence
    results = _supabase_get(
        "newsletter_profiles",
        {"select": "content_intelligence", "id": f"eq.{creator_id}"},
    )
    current = {}
    if results and results[0].get("content_intelligence"):
        current = results[0]["content_intelligence"]
        if isinstance(current, str):
            try:
                current = json.loads(current)
            except json.JSONDecodeError:
                current = {}

    # Append the new analysis
    analyses = current.get("issue_analyses", [])
    new_analysis["analyzed_at"] = datetime.utcnow().isoformat()
    analyses.append(new_analysis)

    # Keep last 20 analyses (enough for a rich profile without bloat)
    analyses = analyses[-20:]

    # Re-synthesize the overall profile from all analyses
    synthesized = _synthesize_profile(analyses)

    intelligence = {
        "issue_analyses": analyses,
        "synthesized": synthesized,
        "issues_analyzed": len(analyses),
        "last_analyzed_at": datetime.utcnow().isoformat(),
    }

    # Save to Supabase
    _supabase_patch(
        f"newsletter_profiles?id=eq.{creator_id}",
        {"content_intelligence": json.dumps(intelligence)},
    )

    logger.info(
        f"content_intelligence: updated {creator_id} — "
        f"{len(analyses)} issues analyzed, "
        f"top topics: {synthesized.get('top_topics', [])[:3]}"
    )

    # Auto re-embed for semantic matching (Layer 3)
    try:
        from embeddings import creator_fingerprint, embed_single, store_creator_embedding
        fingerprint = creator_fingerprint(intelligence)
        if fingerprint:
            embedding = embed_single(fingerprint)
            store_creator_embedding(creator_id, embedding)
            logger.info(f"content_intelligence: re-embedded {creator_id}")
    except Exception as e:
        logger.warning(f"content_intelligence: re-embed failed for {creator_id}: {e}")

    return intelligence


def _synthesize_profile(analyses: list[dict]) -> dict:
    """Synthesize an overall creator profile from multiple issue analyses.

    Aggregates topics, audience signals, style across all analyzed issues
    to produce a single coherent profile.
    """
    if not analyses:
        return {}

    # Aggregate topics (count frequency)
    topic_counts: dict[str, int] = {}
    for a in analyses:
        for topic in a.get("topics", []):
            topic_counts[topic] = topic_counts.get(topic, 0) + 1
    top_topics = sorted(topic_counts.keys(), key=lambda t: -topic_counts[t])[:10]

    # Aggregate audience signals (take most recent + most common)
    professions = [a.get("audience_signals", {}).get("likely_profession", "") for a in analyses if a.get("audience_signals")]
    seniorities = [a.get("audience_signals", {}).get("likely_seniority", "") for a in analyses if a.get("audience_signals")]
    interests: list[str] = []
    for a in analyses:
        interests.extend(a.get("audience_signals", {}).get("likely_interests", []))

    # Most common values
    from collections import Counter
    profession = Counter(p for p in professions if p).most_common(1)
    seniority = Counter(s for s in seniorities if s).most_common(1)
    top_interests = [i for i, _ in Counter(interests).most_common(5)]

    # Writing style (most common)
    styles = [a.get("writing_style", "") for a in analyses if a.get("writing_style")]
    style = Counter(styles).most_common(1)[0][0] if styles else "unknown"

    # Advertiser friendliness (average)
    af_scores = [a.get("advertiser_friendliness", 5) for a in analyses if isinstance(a.get("advertiser_friendliness"), (int, float))]
    avg_af = round(sum(af_scores) / len(af_scores), 1) if af_scores else 5

    # Content consistency (how similar are topics across issues?)
    if len(analyses) >= 3:
        all_topic_sets = [set(a.get("topics", [])) for a in analyses]
        overlaps = []
        for i in range(len(all_topic_sets) - 1):
            for j in range(i + 1, len(all_topic_sets)):
                union = all_topic_sets[i] | all_topic_sets[j]
                if union:
                    overlaps.append(len(all_topic_sets[i] & all_topic_sets[j]) / len(union))
        consistency = round(sum(overlaps) / len(overlaps), 2) if overlaps else 0
    else:
        consistency = None

    # Existing sponsors (collect all mentions)
    sponsors = set()
    for a in analyses:
        sponsors.update(a.get("sponsor_mentions", []))

    # Content categories (most common)
    categories = [a.get("content_category", "") for a in analyses if a.get("content_category")]
    category = Counter(categories).most_common(1)[0][0] if categories else "unknown"

    # Build one-line profile
    prof_str = profession[0][0] if profession else "readers"
    sen_str = seniority[0][0] if seniority else ""
    one_line = f"{sen_str} {prof_str} interested in {', '.join(top_topics[:3])}".strip()

    return {
        "top_topics": top_topics,
        "audience_profile": {
            "likely_profession": profession[0][0] if profession else None,
            "likely_seniority": seniority[0][0] if seniority else None,
            "top_interests": top_interests,
        },
        "writing_style": style,
        "advertiser_friendliness": avg_af,
        "content_consistency": consistency,
        "existing_sponsors": list(sponsors),
        "content_category": category,
        "one_line_profile": one_line,
    }


def process_incoming_issue(sender_email: str, issue_text: str, publication_url: str = "") -> Optional[dict]:
    """Main entry point — called by the Echo listener when a newsletter issue arrives.

    Checks if the sender is a signed-up Stroby creator. If yes, extracts
    intelligence and updates their profile. If no, returns None (not a
    signed-up creator, skip).
    """
    creator = is_signed_up_creator(sender_email, publication_url)
    if not creator:
        return None  # Not a signed-up creator — skip

    creator_name = creator.get("newsletter_name", "")
    logger.info(f"content_intelligence: analyzing issue from signed-up creator '{creator_name}'")

    analysis = analyze_issue(issue_text, creator_name)
    if not analysis:
        logger.warning(f"content_intelligence: extraction returned nothing for '{creator_name}'")
        return None

    intelligence = update_creator_intelligence(creator["id"], analysis)
    return intelligence


if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO)

    if len(sys.argv) > 1 and sys.argv[1] == "test":
        # Test with a sample newsletter text
        test_text = """
        Welcome to this week's edition of Growth Tactics! This week we're diving into
        how B2B SaaS companies can use AI-powered personalization to boost trial-to-paid
        conversion rates. I interviewed 3 founders who increased their conversion by 40%+
        using tools like Intercom, Customer.io, and custom Claude API integrations.

        Key takeaway: the companies winning at personalization aren't just using AI for
        chatbots — they're using it to dynamically adjust their entire onboarding flow
        based on the user's industry, company size, and stated goals during signup.

        Sponsored by Acme Analytics — the dashboard your data team actually wants to use.
        """
        result = analyze_issue(test_text, "Growth Tactics Newsletter")
        print(json.dumps(result, indent=2))
    else:
        print("Usage: python content_intelligence.py test")
