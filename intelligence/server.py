"""
Content Intelligence Service — standalone FastAPI server.

Separate from the leadgen worker. This is a PRODUCT service, not an
outreach tool. It:
  1. Polls stroby@stroby.ai for incoming newsletter issues
  2. Checks if the sender is a signed-up Stroby creator
  3. If yes → extracts structured intelligence via Haiku
  4. Accumulates in Supabase newsletter_profiles.content_intelligence
  5. Serves intelligence data to the matching engine

Runs on port 8001, bound to 127.0.0.1 (localhost only).
Requires Bearer token auth (INTELLIGENCE_API_SECRET).
"""
from __future__ import annotations

import logging
import os
import re
import time
from datetime import datetime
from pathlib import Path

import hmac

from fastapi import FastAPI, HTTPException, Request, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, validator

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
sec_logger = logging.getLogger("security")  # Dedicated security audit log

# ── Load env (only specific keys, not everything) ──
_REQUIRED_KEYS = [
    "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL",
    "INTELLIGENCE_API_SECRET", "VOYAGEAI_API_KEY",
]
env_path = Path(__file__).parent.parent / ".env.local"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            key, _, val = line.partition("=")
            key = key.strip()
            if key in _REQUIRED_KEYS:
                os.environ.setdefault(key, val.strip())

API_SECRET = os.environ.get("INTELLIGENCE_API_SECRET", "")
if not API_SECRET:
    raise RuntimeError("INTELLIGENCE_API_SECRET not set — cannot start without auth")

# ── UUID validation ──
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

def validate_uuid(value: str, field_name: str = "id") -> str:
    if not UUID_RE.match(value):
        raise HTTPException(400, f"Invalid {field_name} format")
    return value


# ── Auth middleware ──
async def verify_auth(request: Request):
    """Verify Bearer token on every request."""
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    if not token or not hmac.compare_digest(token, API_SECRET):
        sec_logger.warning(
            f"AUTH_REJECTED ip={request.client.host} path={request.url.path} "
            f"ua={request.headers.get('user-agent', '?')[:80]}"
        )
        raise HTTPException(401, "Unauthorized")


# ── App setup ──
app = FastAPI(
    title="Stroby Intelligence",
    dependencies=[Depends(verify_auth)],
    docs_url=None,       # Disable /docs — no unauthenticated API schema exposure
    redoc_url=None,      # Disable /redoc
    openapi_url=None,    # Disable /openapi.json
)

# CORS: only allow the Stroby app origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://stroby.ai",
        "https://www.stroby.ai",
        "http://localhost:3000",  # local dev
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

# ── Rate limiting (simple in-memory, per-endpoint) ──
_rate_buckets: dict[str, list[float]] = {}
RATE_LIMITS = {
    "/poll": (2, 300),          # 2 calls per 5 min
    "/analyze-brand": (10, 60), # 10 per minute
    "/embeddings/refresh": (1, 600),  # 1 per 10 min
    "/subscribe": (5, 60),
}

def check_rate_limit(path: str):
    limits = RATE_LIMITS.get(path)
    if not limits:
        return
    max_calls, window_sec = limits
    now = time.time()
    bucket = _rate_buckets.setdefault(path, [])
    # Prune old entries
    bucket[:] = [t for t in bucket if now - t < window_sec]
    if len(bucket) >= max_calls:
        sec_logger.warning(f"RATE_LIMIT path={path} count={len(bucket)}")
        raise HTTPException(429, "Rate limit exceeded")
    bucket.append(now)


# ── Global exception handler (never leak internals) ──
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})
    logger.error(f"Unhandled error on {request.url.path}: {exc}", exc_info=True)
    sec_logger.error(f"UNHANDLED_ERROR path={request.url.path} type={type(exc).__name__}")
    return JSONResponse(status_code=500, content={"error": "Internal server error"})


# ── Request models with validation ──
class SubscribeRequest(BaseModel):
    creator_id: str
    newsletter_url: str
    newsletter_name: str = ""

    @validator("creator_id")
    def validate_creator_id(cls, v):
        if not UUID_RE.match(v):
            raise ValueError("Invalid creator_id format")
        return v

    @validator("newsletter_url")
    def validate_url(cls, v):
        if not v.startswith("http://") and not v.startswith("https://"):
            raise ValueError("URL must start with http:// or https://")
        if len(v) > 2000:
            raise ValueError("URL too long")
        return v


class AnalyzeRequest(BaseModel):
    sender_email: str = ""
    issue_text: str = ""
    publication_url: str = ""

    @validator("issue_text")
    def cap_issue_text(cls, v):
        return v[:50000] if v else v  # Hard cap

    @validator("sender_email")
    def validate_email(cls, v):
        if v and len(v) > 500:
            raise ValueError("Email too long")
        return v


class AnalyzeBrandRequest(BaseModel):
    brand_id: str
    website_url: str = ""
    brand_name: str = ""

    @validator("brand_id")
    def validate_brand_id(cls, v):
        if not UUID_RE.match(v):
            raise ValueError("Invalid brand_id format")
        return v

    @validator("website_url")
    def validate_url(cls, v):
        if v and not v.startswith("http://") and not v.startswith("https://"):
            raise ValueError("URL must start with http:// or https://")
        if v and len(v) > 2000:
            raise ValueError("URL too long")
        return v

    @validator("brand_name")
    def cap_name(cls, v):
        return v[:500] if v else v


class BrandOnboardingRequest(BaseModel):
    brand_id: str
    customer_description: str = ""
    past_sponsors: str = ""
    monthly_budget: str = ""

    @validator("brand_id")
    def validate_brand_id(cls, v):
        if not UUID_RE.match(v):
            raise ValueError("Invalid brand_id format")
        return v

    @validator("customer_description", "past_sponsors")
    def cap_text(cls, v):
        return v[:2000] if v else v


# ── Endpoints ──

@app.post("/subscribe")
def subscribe_creator(body: SubscribeRequest, request: Request):
    check_rate_limit("/subscribe")

    from url_safety import validate_url
    if not validate_url(body.newsletter_url):
        sec_logger.warning(f"SSRF_BLOCKED url={body.newsletter_url[:100]} endpoint=/subscribe")
        raise HTTPException(400, "URL not allowed")

    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent / "leadgen" / "workers"))

    try:
        from subscribe import subscribe as http_subscribe
        result = http_subscribe(body.newsletter_url, "stroby@stroby.ai")
        if not result.ok and "substack" in body.newsletter_url.lower():
            from subscribe_browser import subscribe_via_browser
            result = subscribe_via_browser(body.newsletter_url, "stroby@stroby.ai")
        return {
            "ok": result.ok,
            "creator_id": body.creator_id,
            "method": getattr(result, "method", "?"),
        }
    except Exception as e:
        logger.error(f"Subscribe failed for {body.creator_id}: {e}", exc_info=True)
        return {"ok": False, "error": "Subscribe failed"}


@app.post("/analyze")
def analyze_issue_endpoint(body: AnalyzeRequest):
    from content_intelligence import process_incoming_issue

    result = process_incoming_issue(body.sender_email, body.issue_text, body.publication_url)
    if result is None:
        return {"analyzed": False, "reason": "not a signed-up creator"}
    return {"analyzed": True, "issues_total": result.get("issues_analyzed", 0)}


@app.post("/poll")
def poll_inbox(max_issues: int = 20, request: Request = None):
    check_rate_limit("/poll")
    max_issues = min(max(max_issues, 1), 50)  # Bound 1-50

    from content_intelligence import process_incoming_issue, is_signed_up_creator

    gmail_login = "joaquim@stroby.ai"
    gmail_alias = "stroby@stroby.ai"
    gmail_pass_file = Path.home() / ".stroby_app_password"
    if not gmail_pass_file.exists():
        logger.error("Gmail password file not found")
        raise HTTPException(500, "Email configuration error")

    # Verify file permissions (must be owner-only)
    import stat
    file_mode = os.stat(gmail_pass_file).st_mode
    if file_mode & (stat.S_IRGRP | stat.S_IROTH):
        sec_logger.error(f"INSECURE_PERMISSIONS file={gmail_pass_file} mode={oct(file_mode)}")
        raise HTTPException(500, "Email configuration error")

    gmail_pass = gmail_pass_file.read_text().strip()

    try:
        from imap_tools import MailBox, AND
        from datetime import date, timedelta
    except ImportError:
        raise HTTPException(500, "Email dependencies not installed")

    since = date.today() - timedelta(days=3)
    analyzed = 0
    skipped = 0
    errors = 0
    messages = []

    try:
        with MailBox("imap.gmail.com").login(gmail_login, gmail_pass) as mb:
            messages = list(mb.fetch(AND(date_gte=since, to=gmail_alias), limit=max_issues, mark_seen=False))
            logger.info(f"intelligence poll: {len(messages)} messages found")

            for msg in messages:
                sender = (msg.from_ or "").lower()
                text = msg.text or msg.html or ""

                if not text or len(text) < 100:
                    skipped += 1
                    continue

                creator = is_signed_up_creator(sender)
                if not creator:
                    skipped += 1
                    continue

                try:
                    result = process_incoming_issue(sender, text)
                    if result:
                        analyzed += 1
                    else:
                        skipped += 1
                except Exception as e:
                    errors += 1
                    logger.warning(f"Analysis failed for creator {creator.get('id', '?')}: {type(e).__name__}")

    except Exception as e:
        logger.error(f"IMAP poll failed: {type(e).__name__}: {e}", exc_info=True)
        raise HTTPException(500, "Email polling failed")

    return {
        "messages_checked": len(messages),
        "analyzed": analyzed,
        "skipped": skipped,
        "errors": errors,
    }


# ── Brand Intelligence (Layer 2) ──

@app.post("/analyze-brand")
def analyze_brand_endpoint(body: AnalyzeBrandRequest, request: Request):
    check_rate_limit("/analyze-brand")

    if body.website_url:
        from url_safety import validate_url
        if not validate_url(body.website_url):
            sec_logger.warning(f"SSRF_BLOCKED url={body.website_url[:100]} endpoint=/analyze-brand")
            raise HTTPException(400, "URL not allowed")

    from brand_intelligence import process_brand

    try:
        result = process_brand(body.brand_id, body.website_url, body.brand_name)
    except Exception as e:
        logger.error(f"Brand analysis failed for {body.brand_id}: {type(e).__name__}", exc_info=True)
        raise HTTPException(500, "Brand analysis failed")

    if result is None:
        return {"analyzed": False, "reason": "brand not found or no website content"}
    return {
        "analyzed": True,
        "analyses_count": result.get("analyses_count", 0),
        "ideal_audience": result.get("synthesized", {}).get("ideal_audience", ""),
    }


@app.post("/brand-onboarding")
def brand_onboarding_endpoint(body: BrandOnboardingRequest):
    from brand_intelligence import update_onboarding_data

    answers = {}
    if body.customer_description:
        answers["customer_description"] = body.customer_description
    if body.past_sponsors:
        answers["past_sponsors"] = body.past_sponsors
    if body.monthly_budget:
        answers["monthly_budget"] = body.monthly_budget

    if not answers:
        raise HTTPException(400, "No onboarding data provided")

    try:
        update_onboarding_data(body.brand_id, answers)
    except Exception as e:
        logger.error(f"Brand onboarding update failed for {body.brand_id}: {type(e).__name__}", exc_info=True)
        raise HTTPException(500, "Update failed")

    return {"updated": True, "brand_id": body.brand_id}


@app.get("/brand-stats")
def brand_intelligence_stats():
    from brand_intelligence import _supabase_get

    try:
        profiles = _supabase_get(
            "business_profiles",
            {"select": "id,brand_intelligence",
             "is_active": "eq.true",
             "brand_intelligence": "not.is.null"},
        )
        return {"brands_with_intelligence": len(profiles)}
    except Exception as e:
        logger.error(f"Brand stats query failed: {type(e).__name__}", exc_info=True)
        raise HTTPException(500, "Query failed")


@app.get("/competitive/{brand_id}")
def competitive_landscape(brand_id: str):
    validate_uuid(brand_id, "brand_id")
    from competitive_intel import get_full_competitive_landscape

    try:
        return get_full_competitive_landscape(brand_id)
    except Exception as e:
        logger.error(f"Competitive intel failed for {brand_id}: {type(e).__name__}", exc_info=True)
        raise HTTPException(500, "Query failed")


# ── Semantic Matching (Layer 3) ──

@app.get("/matches/brand/{brand_id}")
def matches_for_brand(brand_id: str, limit: int = 20):
    validate_uuid(brand_id, "brand_id")
    limit = min(max(limit, 1), 100)  # Cap 1-100

    from semantic_matching import get_matches_for_brand

    try:
        matches = get_matches_for_brand(brand_id, limit)
    except Exception as e:
        logger.error(f"Match query failed for brand {brand_id}: {type(e).__name__}", exc_info=True)
        raise HTTPException(500, "Match query failed")

    return {"brand_id": brand_id, "matches": matches, "count": len(matches)}


@app.get("/matches/creator/{creator_id}")
def matches_for_creator(creator_id: str, limit: int = 20):
    validate_uuid(creator_id, "creator_id")
    limit = min(max(limit, 1), 100)

    from semantic_matching import get_matches_for_creator

    try:
        matches = get_matches_for_creator(creator_id, limit)
    except Exception as e:
        logger.error(f"Match query failed for creator {creator_id}: {type(e).__name__}", exc_info=True)
        raise HTTPException(500, "Match query failed")

    return {"creator_id": creator_id, "matches": matches, "count": len(matches)}


@app.post("/embeddings/refresh")
def refresh_embeddings(request: Request):
    check_rate_limit("/embeddings/refresh")
    from embeddings import embed_all_creators, embed_all_brands

    try:
        creators = embed_all_creators()
        brands = embed_all_brands()
    except Exception as e:
        logger.error(f"Embedding refresh failed: {type(e).__name__}", exc_info=True)
        raise HTTPException(500, "Embedding refresh failed")

    return {"creators_embedded": creators, "brands_embedded": brands}


@app.get("/stats")
def intelligence_stats():
    from content_intelligence import _supabase_get

    try:
        profiles = _supabase_get(
            "newsletter_profiles",
            {"select": "id,content_intelligence",
             "is_active": "eq.true",
             "content_intelligence": "not.is.null"},
        )
        total_with_intel = len(profiles)
        total_issues = sum(
            (p.get("content_intelligence") or {}).get("issues_analyzed", 0)
            for p in profiles
            if isinstance(p.get("content_intelligence"), dict)
        )
        return {
            "creators_with_intelligence": total_with_intel,
            "total_issues_analyzed": total_issues,
        }
    except Exception as e:
        logger.error(f"Stats query failed: {type(e).__name__}", exc_info=True)
        raise HTTPException(500, "Query failed")
