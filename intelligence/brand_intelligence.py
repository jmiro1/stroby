"""
Brand Intelligence Engine — Layer 2 of the Stroby matching moat.

ONLY for signed-up Stroby brands (business_profiles). When a brand signs up,
this module scrapes their website and extracts a structured Brand Intelligence
Profile that tells the matching engine WHO they want to reach.

The key insight: matching is audience/need-based, NOT industry-keyword-based.
A travel brand could match a finance newsletter if the readers have disposable
income and travel frequently. So we extract the brand's *ideal reader* profile,
not just their industry.

Flow:
  1. Brand signs up on Stroby (business_profiles row created)
  2. This module scrapes their website (product page, about, blog)
  3. Haiku extracts structured brand intelligence
  4. Onboarding answers (target customer description, past sponsors, budget)
     are merged into the profile
  5. Everything accumulates in business_profiles.brand_intelligence JSONB
  6. Re-synthesize the overall brand profile after each new data source

Data sources:
  - Website scraping (automatic on signup)
  - Onboarding questions (WhatsApp flow)
  - Competitive intelligence (from creator sponsor_mentions in Layer 1)
"""
from __future__ import annotations

import json
import logging
import os
import re
import subprocess
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

CLAUDE_BIN = Path.home() / ".local" / "bin" / "claude"

# Supabase connection (shared with content_intelligence)
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


# ----------------------------------------------------------------- Supabase helpers

def _supabase_get(path: str, params: dict = None) -> list[dict]:
    resp = httpx.get(
        f"{SB_URL}/rest/v1/{path}",
        params=params or {},
        headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


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


# ----------------------------------------------------------------- Website scraping

def _scrape_website(url: str, max_pages: int = 3) -> str:
    """Fetch up to max_pages from a brand's website and return combined text.

    Targets: homepage, /about or /about-us, and /product or /pricing.
    Falls back gracefully if pages don't exist.
    """
    if not url:
        return ""

    # Normalize URL
    url = url.strip().rstrip("/")
    if not url.startswith("http"):
        url = f"https://{url}"

    # SSRF protection: block private/internal URLs
    from url_safety import validate_url
    if not validate_url(url):
        logger.warning(f"brand_intelligence: SSRF blocked for {url[:100]}")
        return ""

    # Pages to try (homepage + common high-signal pages)
    paths_to_try = [
        "",               # homepage
        "/about",
        "/about-us",
        "/pricing",
        "/product",
        "/for-teams",
        "/customers",
    ]

    texts = []
    tried = 0

    for path in paths_to_try:
        if tried >= max_pages:
            break

        page_url = f"{url}{path}"
        try:
            resp = httpx.get(
                page_url,
                timeout=10,
                follow_redirects=False,  # SECURITY: no auto-follow — prevents SSRF via 302 to internal IPs
                headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) StrobyBot/1.0"},
            )
            # Manually follow ONE redirect if it's to a safe URL
            if resp.status_code in (301, 302, 303, 307, 308):
                redirect_url = resp.headers.get("location", "")
                if redirect_url:
                    from url_safety import validate_url as _validate_redirect
                    if not redirect_url.startswith("http"):
                        # Relative redirect — resolve against original URL
                        from urllib.parse import urljoin
                        redirect_url = urljoin(page_url, redirect_url)
                    if _validate_redirect(redirect_url):
                        resp = httpx.get(redirect_url, timeout=10, follow_redirects=False,
                                         headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) StrobyBot/1.0"})
                    else:
                        logger.warning(f"brand_intelligence: SSRF blocked redirect from {page_url} to {redirect_url[:100]}")
                        continue
            if resp.status_code == 200 and resp.headers.get("content-type", "").startswith("text/html"):
                # Extract visible text from HTML
                text = _html_to_text(resp.text)
                if len(text) > 200:  # Only keep pages with real content
                    texts.append(f"--- PAGE: {page_url} ---\n{text}")
                    tried += 1
        except Exception:
            continue

    return "\n\n".join(texts)


def _html_to_text(html: str) -> str:
    """Extract visible text from HTML. Simple regex approach — no heavy deps.

    Uses non-backtracking patterns to prevent regex DoS on untrusted HTML.
    """
    # Cap input to prevent excessive processing
    html = html[:200_000]
    # Remove script/style/noscript blocks (use non-greedy with cap)
    for tag in ("script", "style", "noscript"):
        # Split on opening tag, discard content until closing tag
        parts = re.split(rf'<{tag}[^>]*>', html, flags=re.IGNORECASE)
        cleaned = [parts[0]]
        for part in parts[1:]:
            close_idx = part.lower().find(f'</{tag}>')
            if close_idx >= 0:
                cleaned.append(part[close_idx + len(f'</{tag}>'):])
            # If no closing tag found, discard the rest of this segment
        html = "".join(cleaned)
    # Remove HTML tags
    text = re.sub(r'<[^>]+>', ' ', html)
    # Decode common entities
    text = text.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&nbsp;', ' ')
    text = re.sub(r'&#?\w+;', ' ', text)
    # Collapse whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text


# ----------------------------------------------------------------- Haiku extraction

BRAND_EXTRACTION_PROMPT = """You are analyzing a brand's website to build a Brand Intelligence Profile for Stroby's matching engine. Extract structured data that helps match this brand with the RIGHT newsletter creators.

CRITICAL: Focus on WHO this brand wants to reach, not just what industry they're in.
"A travel brand might want to reach finance professionals with disposable income" — think about the AUDIENCE, not the category.

Be SPECIFIC. "Business professionals" is useless. "Series B SaaS CTOs managing 20-100 person engineering teams" is gold.

Return STRICT JSON:
{
  "product_category": "specific description — e.g. 'project management SaaS for remote engineering teams', NOT just 'SaaS'",
  "target_customer": {
    "profession": "e.g. engineering managers, product leads, marketing directors",
    "company_size": "e.g. 50-500 employees, enterprise, solo founders",
    "seniority": "e.g. mid-career, senior, executive, early-career",
    "pain_points": ["specific pain point 1", "pain point 2"],
    "income_bracket": "e.g. $80k-$150k, $150k+, unknown",
    "psychographic": "what kind of person buys this? e.g. 'ambitious operators who read about scaling', 'creative freelancers who value independence'"
  },
  "brand_voice": "professional | playful | edgy | premium | technical | minimalist",
  "competitors": ["direct competitor 1", "competitor 2"],
  "budget_signals": "bootstrapped | seed | series-a-b | growth | enterprise",
  "content_themes_they_align_with": ["theme 1", "theme 2", "theme 3"],
  "audience_they_want": "one-line description of their ideal newsletter reader — think about lifestyle, income, mindset, not just job title",
  "newsletter_fit_notes": "what kind of newsletters would their ideal customer read? e.g. 'productivity newsletters, leadership blogs, remote-work digests'"
}

Return ONLY the JSON. No markdown, no explanation."""


def analyze_brand_website(website_url: str, brand_name: str = "", extra_context: str = "") -> Optional[dict]:
    """Scrape a brand's website and extract structured intelligence via Haiku."""
    website_text = _scrape_website(website_url)
    if not website_text or len(website_text.strip()) < 200:
        logger.warning(f"brand_intelligence: not enough content from {website_url}")
        return None

    # Truncate to keep Haiku cost low
    text = website_text[:8000]

    user_prompt = f"Brand: {brand_name}\nWebsite: {website_url}\n"
    if extra_context:
        user_prompt += f"Additional context: {extra_context}\n"
    user_prompt += f"\nWebsite content:\n\n{text}"

    try:
        result = subprocess.run(
            [str(CLAUDE_BIN), "--print", "--no-session-persistence",
             "--tools", "",
             "--model", "claude-haiku-4-5",
             "--system-prompt", BRAND_EXTRACTION_PROMPT,
             "--output-format", "json",
             "--",  # Separator: everything after is positional, not flags
             user_prompt],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode == 0:
            outer = json.loads(result.stdout)
            raw_text = outer.get("result", "")
            try:
                return json.loads(raw_text)
            except json.JSONDecodeError:
                match = re.search(r'\{[\s\S]*\}', raw_text)
                if match:
                    return json.loads(match.group())
    except Exception as e:
        logger.warning(f"brand_intelligence: Haiku extraction failed: {e}")

    return None


# ----------------------------------------------------------------- Profile management

def get_brand(brand_id: str) -> Optional[dict]:
    """Fetch a single brand from business_profiles."""
    results = _supabase_get(
        "business_profiles",
        {"select": "id,company_name,email,product_description,target_customer,primary_niche,description,budget_range,campaign_goal,brand_intelligence",
         "id": f"eq.{brand_id}",
         "is_active": "eq.true"},
    )
    return results[0] if results else None


def get_all_brands() -> list[dict]:
    """Get all active brands."""
    return _supabase_get(
        "business_profiles",
        {"select": "id,company_name,email,product_description,target_customer,primary_niche,description,budget_range,brand_intelligence",
         "is_active": "eq.true"},
    )


def update_brand_intelligence(brand_id: str, new_analysis: dict, source: str = "website") -> dict:
    """Accumulate a new analysis into the brand's intelligence profile.

    The brand_intelligence JSONB field stores:
    {
      "website_analyses": [{date, source, ...}, ...],
      "onboarding_data": {...},
      "synthesized": {overall profile},
      "analyses_count": N,
      "last_analyzed_at": "..."
    }
    """
    results = _supabase_get(
        "business_profiles",
        {"select": "brand_intelligence", "id": f"eq.{brand_id}"},
    )
    current = {}
    if results and results[0].get("brand_intelligence"):
        current = results[0]["brand_intelligence"]
        if isinstance(current, str):
            try:
                current = json.loads(current)
            except json.JSONDecodeError:
                current = {}

    # Append the new analysis
    analyses = current.get("website_analyses", [])
    new_analysis["analyzed_at"] = datetime.utcnow().isoformat()
    new_analysis["source"] = source
    analyses.append(new_analysis)
    analyses = analyses[-10:]  # Keep last 10

    # Merge onboarding data if present
    onboarding = current.get("onboarding_data", {})

    # Re-synthesize
    synthesized = _synthesize_brand_profile(analyses, onboarding)

    intelligence = {
        "website_analyses": analyses,
        "onboarding_data": onboarding,
        "synthesized": synthesized,
        "analyses_count": len(analyses),
        "last_analyzed_at": datetime.utcnow().isoformat(),
    }

    _supabase_patch(
        f"business_profiles?id=eq.{brand_id}",
        {"brand_intelligence": json.dumps(intelligence)},
    )

    logger.info(
        f"brand_intelligence: updated {brand_id} — "
        f"{len(analyses)} analyses, "
        f"audience: {synthesized.get('ideal_audience', 'unknown')[:60]}"
    )

    # Auto re-embed for semantic matching (Layer 3)
    _auto_reembed_brand(brand_id, intelligence)

    return intelligence


def update_onboarding_data(brand_id: str, onboarding_answers: dict) -> dict:
    """Merge onboarding answers into the brand intelligence profile.

    Called when a brand answers enhanced onboarding questions:
    - customer_description: "Describe the person who buys your product"
    - past_sponsors: "What newsletters have you sponsored before?"
    - monthly_budget: "What's your monthly newsletter budget?"
    """
    results = _supabase_get(
        "business_profiles",
        {"select": "brand_intelligence", "id": f"eq.{brand_id}"},
    )
    current = {}
    if results and results[0].get("brand_intelligence"):
        current = results[0]["brand_intelligence"]
        if isinstance(current, str):
            try:
                current = json.loads(current)
            except json.JSONDecodeError:
                current = {}

    analyses = current.get("website_analyses", [])
    onboarding = current.get("onboarding_data", {})
    onboarding.update(onboarding_answers)
    onboarding["updated_at"] = datetime.utcnow().isoformat()

    synthesized = _synthesize_brand_profile(analyses, onboarding)

    intelligence = {
        "website_analyses": analyses,
        "onboarding_data": onboarding,
        "synthesized": synthesized,
        "analyses_count": len(analyses),
        "last_analyzed_at": datetime.utcnow().isoformat(),
    }

    _supabase_patch(
        f"business_profiles?id=eq.{brand_id}",
        {"brand_intelligence": json.dumps(intelligence)},
    )

    logger.info(f"brand_intelligence: updated onboarding data for {brand_id}")

    # Auto re-embed for semantic matching (Layer 3)
    _auto_reembed_brand(brand_id, intelligence)

    return intelligence


def _auto_reembed_brand(brand_id: str, intelligence: dict):
    """Re-generate embedding after intelligence update."""
    try:
        from embeddings import brand_fingerprint, embed_single, store_brand_embedding
        fingerprint = brand_fingerprint(intelligence)
        if fingerprint:
            embedding = embed_single(fingerprint)
            store_brand_embedding(brand_id, embedding)
            logger.info(f"brand_intelligence: re-embedded {brand_id}")
    except Exception as e:
        logger.warning(f"brand_intelligence: re-embed failed for {brand_id}: {e}")


# ----------------------------------------------------------------- Synthesis

def _synthesize_brand_profile(analyses: list[dict], onboarding: dict) -> dict:
    """Synthesize an overall brand profile from website analyses + onboarding data."""
    if not analyses and not onboarding:
        return {}

    # Aggregate from website analyses
    product_categories = [a.get("product_category", "") for a in analyses if a.get("product_category")]
    professions = [a.get("target_customer", {}).get("profession", "") for a in analyses if a.get("target_customer")]
    seniorities = [a.get("target_customer", {}).get("seniority", "") for a in analyses if a.get("target_customer")]
    company_sizes = [a.get("target_customer", {}).get("company_size", "") for a in analyses if a.get("target_customer")]
    income_brackets = [a.get("target_customer", {}).get("income_bracket", "") for a in analyses if a.get("target_customer")]
    psychographics = [a.get("target_customer", {}).get("psychographic", "") for a in analyses if a.get("target_customer")]

    pain_points: list[str] = []
    for a in analyses:
        pain_points.extend(a.get("target_customer", {}).get("pain_points", []))

    themes: list[str] = []
    for a in analyses:
        themes.extend(a.get("content_themes_they_align_with", []))

    competitors: list[str] = []
    for a in analyses:
        competitors.extend(a.get("competitors", []))

    audience_descriptions = [a.get("audience_they_want", "") for a in analyses if a.get("audience_they_want")]
    newsletter_fit = [a.get("newsletter_fit_notes", "") for a in analyses if a.get("newsletter_fit_notes")]

    # Most common values
    product_cat = Counter(c for c in product_categories if c).most_common(1)
    profession = Counter(p for p in professions if p).most_common(1)
    seniority = Counter(s for s in seniorities if s).most_common(1)
    company_size = Counter(s for s in company_sizes if s).most_common(1)
    income = Counter(i for i in income_brackets if i and i != "unknown").most_common(1)
    psycho = Counter(p for p in psychographics if p).most_common(1)

    top_themes = [t for t, _ in Counter(themes).most_common(8)]
    top_pain_points = [p for p, _ in Counter(pain_points).most_common(5)]
    all_competitors = list(set(c for c in competitors if c))

    # Brand voice
    voices = [a.get("brand_voice", "") for a in analyses if a.get("brand_voice")]
    voice = Counter(voices).most_common(1)[0][0] if voices else "unknown"

    # Budget signals from website
    budgets = [a.get("budget_signals", "") for a in analyses if a.get("budget_signals")]
    budget_signal = Counter(budgets).most_common(1)[0][0] if budgets else "unknown"

    # Merge onboarding data (higher weight — direct from the brand)
    if onboarding.get("customer_description"):
        audience_descriptions.insert(0, onboarding["customer_description"])
    if onboarding.get("past_sponsors"):
        # past_sponsors could be a string or list
        ps = onboarding["past_sponsors"]
        if isinstance(ps, str):
            all_competitors.extend([s.strip() for s in ps.split(",") if s.strip()])
        elif isinstance(ps, list):
            all_competitors.extend(ps)

    # Build ideal audience description (prioritize onboarding, then website)
    ideal_audience = audience_descriptions[0] if audience_descriptions else ""

    # Build one-line profile
    prof_str = profession[0][0] if profession else "professionals"
    sen_str = seniority[0][0] if seniority else ""
    theme_str = ", ".join(top_themes[:3]) if top_themes else "their space"
    one_line = f"Wants to reach {sen_str} {prof_str} interested in {theme_str}".strip()

    return {
        "product_category": product_cat[0][0] if product_cat else None,
        "ideal_audience": ideal_audience,
        "target_profile": {
            "profession": profession[0][0] if profession else None,
            "seniority": seniority[0][0] if seniority else None,
            "company_size": company_size[0][0] if company_size else None,
            "income_bracket": income[0][0] if income else None,
            "psychographic": psycho[0][0] if psycho else None,
            "pain_points": top_pain_points,
        },
        "content_affinity": top_themes,
        "brand_voice": voice,
        "budget_signal": budget_signal,
        "competitors": all_competitors[:10],
        "newsletter_fit": newsletter_fit[0] if newsletter_fit else None,
        "one_line_need": one_line,
    }


# ----------------------------------------------------------------- Main entry point

def process_brand(brand_id: str, website_url: str = "", brand_name: str = "") -> Optional[dict]:
    """Main entry point — analyze a brand and update their intelligence profile.

    Can be called:
    1. On brand signup (auto-trigger)
    2. Manually via the /analyze-brand endpoint
    3. Periodically to refresh stale profiles
    """
    # If no URL provided, fetch from Supabase
    if not website_url or not brand_name:
        brand = get_brand(brand_id)
        if not brand:
            logger.warning(f"brand_intelligence: brand {brand_id} not found")
            return None
        if not website_url:
            website_url = brand.get("description", "")  # description often has the URL
            # Also check product_description for a URL
            for field in ["description", "product_description"]:
                text = brand.get(field, "") or ""
                url_match = re.search(r'https?://[^\s]+', text)
                if url_match:
                    website_url = url_match.group()
                    break
        if not brand_name:
            brand_name = brand.get("company_name", "")

    if not website_url:
        logger.warning(f"brand_intelligence: no website URL for brand {brand_id}")
        return None

    logger.info(f"brand_intelligence: analyzing {brand_name} ({website_url})")

    # Build extra context from existing Supabase data
    brand = get_brand(brand_id) if not brand_name else None
    extra = ""
    if brand:
        if brand.get("product_description"):
            extra += f"Product: {brand['product_description']}\n"
        if brand.get("target_customer"):
            extra += f"Target customer: {brand['target_customer']}\n"
        if brand.get("primary_niche"):
            extra += f"Niche: {brand['primary_niche']}\n"
        if brand.get("budget_range"):
            extra += f"Budget: {brand['budget_range']}\n"

    analysis = analyze_brand_website(website_url, brand_name, extra)
    if not analysis:
        logger.warning(f"brand_intelligence: extraction returned nothing for {brand_name}")
        return None

    intelligence = update_brand_intelligence(brand_id, analysis, source="website")
    return intelligence


# ----------------------------------------------------------------- CLI testing

if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO)

    if len(sys.argv) > 1 and sys.argv[1] == "test":
        # Test with a real website
        url = sys.argv[2] if len(sys.argv) > 2 else "https://linear.app"
        name = sys.argv[3] if len(sys.argv) > 3 else "Linear"
        print(f"Analyzing {name} ({url})...")
        result = analyze_brand_website(url, name)
        print(json.dumps(result, indent=2))
    elif len(sys.argv) > 1 and sys.argv[1] == "brand":
        # Analyze a brand by ID
        brand_id = sys.argv[2]
        url = sys.argv[3] if len(sys.argv) > 3 else ""
        result = process_brand(brand_id, url)
        print(json.dumps(result, indent=2))
    else:
        print("Usage:")
        print("  python brand_intelligence.py test [url] [name]  — test website extraction")
        print("  python brand_intelligence.py brand <id> [url]   — analyze a brand by ID")
