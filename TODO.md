# Stroby.ai — V2 TODO List (Live)

> **SCOPE — READ FIRST (for Claude / future me)**
>
> This TODO is **only for the production Stroby app**: the Next.js codebase
> at `/Users/joaquimmiro/stroby/`, its Supabase project, and the real users
> (creators, businesses, transactions) it serves.
>
> **Marketing / lead-gen / scraping / cold outreach work is OUT OF SCOPE here.**
> That lives in a fully separate sidecar at `/Users/joaquimmiro/stroby/leadgen/`
> with its own SQLite database, its own n8n workflows, its own TODO at
> `/Users/joaquimmiro/stroby/leadgen/marketingtodo.md`. The leadgen system never reads
> from or writes to the Stroby app's Supabase. The only crossover is a UTM
> link in an outreach message that, when clicked by a real human, takes them
> through the normal Stroby onboarding flow.
>
> **Why the strict split:**
> 1. **Security** — marketing automation has different access patterns and
>    failure modes than a customer-facing product. Mixing them widens the
>    blast radius of any bug or compromise.
> 2. **Data hygiene** — cold prospects are not customers. Putting thousands
>    of unenriched scraped rows in the production DB pollutes analytics,
>    matching jobs, and the user experience.
> 3. **Independent iteration** — the marketing system changes weekly; the
>    product DB schema should not.
>
> **When unsure where a task belongs, ask first.** Don't add scraper /
> outreach / lead-enrichment / Clay / n8n tasks here, and don't add
> product-feature / customer-data / Supabase-schema tasks to the leadgen
> TODO. If a task touches both worlds (e.g. "track which onboarding signups
> came from leadgen outreach"), the answer is usually: instrument the app
> side with a UTM param and let leadgen read its own attribution from its
> own logs.



## ~~Priority 1: Chat Widget Hybrid AI Upgrade~~ DONE
- [x] Build `/api/chat` endpoint that sends user messages to Claude
- [x] Three onboarding paths: Business survey, Influencer survey, free-form Claude chat ("Other")
- [x] Claude extracts profile data from natural conversation
- [x] Dedicated `other_profiles` table with rich data for future matching
- [x] Conditional survey steps (e.g., "Other" niche → follow-up question)
- [x] Terms & Conditions consent step on all survey paths (influencer, business, other)

## ~~Priority 2: Double Opt-In Introduction Flow~~ DONE
- [x] Matching job sends WhatsApp match suggestions to businesses
- [x] `/api/introductions/respond` handles accept/decline/tell_me_more for both sides
- [x] Double opt-in → sends confirmation to both parties via WhatsApp
- [x] `/api/introductions/book` creates transaction + Stripe Checkout + UTM link
- [x] AI agent detects intent from WhatsApp replies (accept/decline/rating phrases)
- [x] `/api/jobs/expire-introductions` auto-expires after 72h

## ~~Priority 3: Post-Placement Flow~~ DONE
- [x] `/api/placements/proof` — creator submits clicks, opens, screenshot
- [x] `/api/placements/remind` — reminds creators about overdue placements
- [x] 5 business day appeal window calculation (skips weekends)
- [x] `/api/placements/appeal` — business files dispute
- [x] `/api/jobs/check-appeals` — auto-payout via Stripe Transfer after appeal expires
- [x] `/api/jobs/send-followups` — 1 week post-release, requests 1-5 rating
- [x] `/api/feedback` — collects ratings, recalculates avg_match_rating

## ~~Priority 4: Platform Verification~~ DONE
- [x] Beehiiv API: fetch subscribers, open rate, CTR
- [x] ConvertKit API: fetch subscriber count
- [x] Screenshot verification fallback
- [x] `/verify/[newsletterId]` page with tabbed form
- [x] 10% tolerance comparison, API is source of truth

## ~~Priority 5a: Frontend Redesign~~ DONE
- [x] Boardy-style homepage with character image, "Hey, I'm Stroby", Message button
- [x] WhatsApp-style inline onboarding chat in phone mockup
- [x] Marketing content moved to /about page
- [x] Terms & Conditions page (`/terms`) — Stroby AI Inc.
- [x] Privacy Policy page (`/privacy`) — GDPR/CCPA/PIPEDA + Meta WhatsApp Platform disclosures
- [x] SEO updated everywhere (title, meta, OG, Twitter, JSON-LD, sitemap)
- [x] Stroby character as logo, chat avatar, and favicon
- [x] OG image at /public/og-image.png

## ~~Priority 5b: Polish & Launch~~ DONE
- [x] Company name: Stroby AI Inc. (terms + privacy)
- [x] Rate limit: max 3 suggestions/week/business
- [x] Rate limit: max 2 intro requests/week/creator
- [x] Stripe webhook handles checkout.session.completed + payment_intent.succeeded + account.updated

## ~~Priority 6: WhatsApp Setup~~ DONE
- [x] Meta Cloud API integration (replaced Twilio completely — `twilio.ts` → `whatsapp.ts`)
- [x] Production verified number: +54 9 11 7634 5405 (Stroby AI)
- [x] Phone Number ID: 1030871830113563
- [x] WhatsApp Business Account: 914380484830725
- [x] System user token (60-day, expires ~June 1, 2026)
- [x] Webhook: `https://stroby.ai/api/webhooks/whatsapp`
- [x] 7 message templates registered (match_found_1, match_confirmation, follow_up_feedback, placement_reminder, weekly_update, call_permission_1, welcome_confirmation_1)
- [x] Smart send: tries text first, falls back to template outside 24h window
- [x] Official wa.me message link: `https://wa.me/message/2QFL7QR7EBZTD1`

## ~~Priority 7: WhatsApp Landing Page~~ DONE
- [x] `/whatsapp` — "Message me on WhatsApp" landing page with Stroby character
- [x] Conversion cookie tracking (stroby_wa_click, stroby_utm, stroby_wa_src)
- [x] `/whatsapp-confirmation` — verification page (sets stroby_wa_verified cookie, updates onboarding_status)
- [x] `/api/verify/whatsapp` — marks profile as whatsapp_active
- [x] SEO-optimized with meta tags and sitemap entry

## ~~Priority 8: Stripe Setup~~ DONE
- [x] Stripe API keys on Vercel
- [x] Stripe webhook live at `https://stroby.ai/api/webhooks/stripe`
- [x] Escrow is OPTIONAL — users can deal directly, escrow is for protection

## ~~Priority 9: Expanded Matching~~ DONE
- [x] Matching engine queries both `newsletter_profiles` and `other_profiles`
- [x] Business onboarding asks partner preference (newsletters only / creators only / all)
- [x] `partner_preference` column on `business_profiles`
- [x] `creator_id` + `creator_type` columns on `introductions`
- [x] Separate scoring prompts for newsletters vs. other creators
- [x] Introduction respond flow handles both creator types

## ~~Priority 10: Meta App Review~~ DONE
- [x] Meta app live (App ID: 1278038874427869)
- [x] Privacy policy updated with Meta/WhatsApp Platform data disclosures
- [x] Data deletion callback: `https://stroby.ai/api/meta/data-deletion`
- [x] Data deletion status page: `/data-deletion`
- [x] META_APP_SECRET configured on Vercel
- [x] CRON_SECRET configured on Vercel

## ~~Priority 11: AI Agent Tuning~~ DONE
- [x] Agent doesn't generate fake URLs
- [x] Stripe/escrow is optional — not pushed in conversation
- [x] Focus on matching and introductions, not payment setup

---

## NEXT: What Needs To Be Done

### BLOCKER: Enable Stripe Connect
- [ ] Go to https://dashboard.stripe.com/connect and sign up for Connect
- [ ] Without this, Stripe link generation will always fail
- [ ] Once enabled, test with: `curl -X POST https://stroby.ai/api/stripe/connect -d '{"newsletterId":"..."}'`

### Priority A: End-to-End Testing
- [ ] Test full flow: onboard → match → WhatsApp intro → accept → connect both parties
- [ ] Test with real newsletter owner + real business (not test data)
- [ ] Verify AI agent responses are natural and helpful
- [ ] Test the "Other" (creator/influencer) onboarding and matching path
- [ ] Verify cron job runs daily at 8am UTC (matching + reminders)

### Priority B: WhatsApp Token Renewal
- [ ] System user token expires ~June 1, 2026 — set reminder to renew
- [ ] Consider automating token refresh or upgrading to a truly permanent token

### Priority C: Growth & Distribution
- [x] Submit sitemap to Google Search Console
- [ ] Create social media profiles (LinkedIn, X/Twitter — links already in nav)
- [ ] Onboard initial 30-50 newsletter owners / influencers
- [ ] Onboard initial 20 businesses
- [x] Create sharable QR code for wa.me link (`/qr` page, print-friendly + PNG/SVG download)
- [ ] Consider Vercel Pro for additional cron jobs (currently 1 daily on Hobby plan)

### Priority D: Feature Improvements
- [x] Auto-send Stripe Connect link when a deal is ready
- [x] Pre-AI intent classification (greetings, yes/no, ratings, stripe requests handled without AI)
- [x] Async webhook processing (return 200 immediately, process in background)
- [x] Conversation memory (summaries every 10 messages, stored on profile)
- [x] Profile auto-update from conversations ([PROFILE_UPDATE] marker)
- [x] Idempotency on webhook (unique index on whatsapp_message_id)
- [ ] AI voice call flow (call_permission template registered, needs voice API integration)
- [x] Welcome template message for new signups (sent right after createProfileFromOnboarding via sendWelcomeWithFallback)
- [x] Dynamic URL in welcome_confirmation template (pass user ID — sent as URL button param, lands on /welcome/[id])
- [ ] Add email as fallback communication channel

### ~~Priority D2: Migrate Intelligence Service from Local Mac to Vercel~~ DONE (2026-04-15)

Matching Intelligence Engine fully ported from Python/local to TypeScript/Vercel.
No more local Mac dependency — everything runs on Vercel.

**What was built (all in `src/lib/intelligence/`):**
- `content.ts` — Haiku extraction of newsletter issues via Anthropic TS SDK
- `brand.ts` — Website scraping + Haiku brand profile extraction + SSRF protection
- `embeddings.ts` — Voyage AI embeddings (voyage-3-lite, batched, 1024d→1536 padded)
- `matching.ts` — Cosine similarity + industry-aware 4-tier value scoring
- `url-safety.ts` — SSRF protection (DNS resolution, private IP blocking)
- `auth.ts` — Constant-time Bearer token verification (crypto.timingSafeEqual)

**API routes (all at `/api/intelligence/`):**
- POST `/analyze` — analyze a newsletter issue
- POST `/analyze-brand` — scrape + analyze a brand website
- POST `/brand-onboarding` — merge onboarding answers
- GET `/matches/brand?id=` — top creator matches
- GET `/matches/creator?id=` — top brand matches
- POST `/embeddings` — refresh all embeddings
- GET `/stats` — intelligence profile counts

**Remaining:** Newsletter content ingestion needs a push-based trigger (email forwarding → webhook) instead of the old IMAP polling. Low priority until creators start publishing.

### Priority E: Matching Refinement

**Level 1 (Done)**
- [x] Multi-factor LLM scoring prompt — audience fit, niche alignment, engagement, goal match, credibility
- [x] Niche distance weighting — exact niche match gets +15% boost, close related +5%
- [x] Multi-factor pre-ranking — engagement (40%) + niche proximity (30%) + verification (15%) + rating (15%)
- [x] Concerns tracking — AI flags potential issues, stored on introduction for analysis
- [x] Raised min threshold from 0.3 to 0.4 for higher quality
- [x] Hard rules: demographic mismatch = below 0.4, brand vs direct response mismatch = concern
- [x] Niche distance stored on introduction (0=exact, 1=close, 2=related, 3=loose)
- [x] Decline tracking — declined niches already excluded from future matches (2+ declines)
- [x] Past match success rate per niche pair already in scoring prompt

**Level 2 (Next)**
- [x] Decline REASON tracking — ask users why they declined, learn from text not just niche
- [ ] Acceptance rate analysis — tune weights based on which scores convert
- [ ] Use concerns data to refine niche affinity map (find false positives)
- [ ] Track time-to-accept as a quality signal

**Level 3 (Done — 2026-04-15)**
- [x] Semantic embeddings via Voyage AI (audience/need-based, NOT keyword matching)
- [x] Industry-aware value-per-subscriber model (4 tiers: ultra_high_ticket → volume_play)
- [x] Brand Intelligence: website scraping + Haiku extraction + competitive intel
- [x] Content Intelligence: newsletter issue analysis + audience profiling
- [x] Cosine similarity + 5 adjustment factors (audience size, ad-friendliness, consistency, income, competitors)
- [x] Match explanations with human-readable reasoning
- [ ] Audience geography overlap — collect region data, match by location
- [ ] A/B test different scoring prompts to optimize acceptance rates
- [ ] Collaborative filtering — "businesses like yours accepted these"
- [ ] Time-of-day / day-of-week optimization for match sending
- [ ] Match explainability page — click a link in the match message to see scoring breakdown

### ~~Priority E2: Shadow Profiles Architecture~~ DONE (2026-04-15)

Shipped in a single session. Full plan: [SHADOW_PROFILES_PLAN.md](./SHADOW_PROFILES_PLAN.md).

**What was built:**
- Schema migration: `business_profiles` + `newsletter_profiles` renamed to `*_all` base tables; `*_profiles` views (real only, WITH CHECK OPTION); `*_directory` views (real + shadow, for matching); RLS + 6 policies; `shadow_source` + `claimed_at` columns; partial indexes
- Ingestion endpoint: `POST /api/shadow/ingest` with `INGEST_SECRET` Bearer auth (constant-time compare), body cap, strict input validation
- Claim flow: HMAC-SHA256 signed tokens, `/claim/[token]` page with abbreviated onboarding form, atomic `UPDATE ... WHERE onboarding_status='shadow'` promotion
- Matching engine: queries `business_directory` + `newsletter_directory` (sees shadows), emits `counterparty_status` per match
- Onboarding collision check: if a new user's website matches a shadow row, promotes it instead of creating a duplicate
- Outreach stub: `fireShadowClaimOutreach()` signs a claim URL and logs; real cold-email (Smartlead) integration comes next
- Privacy policy: Section 13 added for pre-launch directory + opt-out path (`privacy@stroby.ai`, 72hr removal)
- Env vars: `INGEST_SECRET` + `CLAIM_TOKEN_SECRET` on Vercel (production + preview + development)
- Backup: in-DB snapshot tables + local pg_dump at `~/.stroby_backups/`
- Down-migration: `supabase/migrations_down/20260415_shadow_profiles_down.sql`
- V1 fallback: frozen at `jmiro1/stroby-v1` tag `v1.0.0-pre-shadow`. Revert runbook: [REVERT.md](./REVERT.md)

### URGENT: Make GitHub Repo Private

The `jmiro1/stroby` repo is currently **public** because Vercel Hobby plan's build runner fails on private repos after our repo-rename (2026-04-15). This exposes all source code including architecture docs.

**No secrets are exposed** — all credentials are in Vercel env vars, not in code. But the full application logic, shadow profiles architecture, matching algorithm, and business strategy docs are visible.

**Options (pick one):**
- [ ] **Vercel Pro ($20/mo)** — proper private repo deploys + extra cron slot (currently limited to 1 daily). Recommended.
- [ ] **Fresh Vercel project import** — create new Vercel project from the private repo, migrate env vars (26 vars) + domain (`stroby.ai`). More work but stays on Hobby.
- [ ] **Vercel CLI deploy workaround** — `vercel deploy --prod` from CLI after each push. Was failing with "Unexpected error" on 2026-04-15; may resolve after build cache clears.

### Priority E3: Scale to 500 Creators + 500 Brands (In Progress)

Shadow profiles infrastructure is live. Ingestion endpoint working. First batch done.

**DONE (2026-04-16-17):**
- [x] YC Combinator W25 batch — 20 brand shadows with Brand Intelligence
- [x] Substack leads batch — 203 creator shadows from existing SQLite
- [x] Niche mapping (Substack categories → Stroby NICHES)
- [x] Views recreated to include new columns
- [x] Programmatic SEO pages live at `/newsletters` and `/newsletters/[niche]`

**Data quality (P0 — do before claim emails):**
- [ ] **Real subscriber counts** — Substack hides exact numbers. Options: Clay+SparkLoop, creator self-reports on claim, platform API verification
- [ ] **Run all YC batches** — S24/W24/S23 + all-time (~5,850 brands): `ssh VPS && python scrape_yc.py`
- [ ] **Run remaining creator leads** — 203 of 7,500 done: `python ingest_existing_leads.py --max 5000`
- [ ] **Founder/contact enrichment** — Clay or detail page scraping for LinkedIn/email
- [ ] **Install Scrapling on VPS** — for beehiiv + Paved scraping (Cloudflare bypass)

**Scrapers still to build:**
- [ ] **beehiiv Discover scraper** — needs Scrapling StealthyFetcher (Cloudflare). 5,000+ creators.
- [ ] **Meta Ad Library scraper** — Python script, public API. 1,000+ brands/day.
- [ ] **Paved marketplace scraper** — needs Scrapling or OpenClaw (JS rendering). ~500 warm brands.
- [ ] **Substack BFS depth-3** — re-run existing Scrapy spider with deeper depth. 10,000+ pubs.

**Account fleet for Substack DMs (bypass single-account rate limit):**
- [ ] Create 2-3 additional Substack personas for parallel DM sending
- [ ] Residential proxy rotation per account (Smartproxy or IPRoyal)
- [ ] Warmup curve per account (reuse `dm.py` pattern)

**Cross-channel outreach:**
- [ ] Twitter/X DM agent via OpenClaw (different rate-limit profile than Substack)
- [ ] LinkedIn connection requests with intro note (15-20/day/account)
- [ ] Reddit presence in r/newsletters, r/Substack, r/marketing (5-10/day)

**Claim-flow cold email integration:**
- [ ] Smartlead setup for brand claim emails (cold-email warmup infra)
- [ ] Hyper-personalized email per brand — uses Brand Intelligence to reference their product + show 3 pre-matched creators
- [ ] Competitor sponsor-poaching angle — "Your competitor sponsors newsletter X; here are 5 untapped creators"

**Viral loops from existing users:**
- [ ] Ambassador code via WhatsApp — auto-send wa.me invite link to every signed-up creator
- [ ] "Matchmaker Thursday" weekly WhatsApp blast — "3 new brands joined in your niche"
- [ ] Post-match shareable card for social proof

**Monitoring + quality:**
- [ ] Daily ban-detection scan (OpenClaw checks if accounts can still log in)
- [ ] Reply-rate attribution (match inbound replies to lead_id, auto-tune niche priority)
- [ ] Sent-message auditing (re-verify DMs actually landed in Substack sent folder)

### Priority E4: Matching & Growth Refinements

- [ ] Admin dashboard toggle: `?include_shadows=1` to see shadow counts alongside real
- [ ] Shadow-profile expiry job: purge shadows older than 180 days with no introductions (cron)
- [ ] `awaiting_claim` introduction status — park matches with shadow counterparty until claimed or 7-day expiry
- [ ] Accept decline tracking against shadow-originated matches — tune scoring separately
- [ ] Audience geography overlap — collect region data for more precise matching
- [ ] A/B test different claim-email subject lines to optimize claim rate
- [ ] Collaborative filtering — "businesses like yours matched with these creators"

### Priority E5: Viral Loops (HIGH — wait for quality match density)

Do NOT launch until there are enough quality matches that blasts are worth it. Premature blasts will churn subscribers.

- [ ] **"Matchmaker Thursday"** — weekly WhatsApp blast to all subscribers: "3 new [brands/creators] joined in [your niche] this week." Only send when there are genuinely new matches to show — never filler.
- [ ] **Post-match celebration card** — auto-generated shareable image when a match happens. Nudge both sides to share on social (X, LinkedIn).
- [ ] **Ambassador leaderboard** — show affiliates how many signups their referrals generated. Gamification drives sharing.
- [ ] **Creator-to-creator referral bonus** — "Refer 3 creators → get priority matching for 30 days" (beyond the affiliate commission)
- [ ] **Trigger condition:** activate viral loops ONLY when shadow DB has 500+ brands AND 200+ creators with Brand/Content Intelligence profiles (enough for quality matches in most niches)

### Priority F: Highest Priority (Next Up)
- [ ] #5 AI voice calls integration (Vapi/Bland.ai) — `call_permission_1` template ready
- [ ] #9 Real-time activity feed on public stats page ("Maria just joined", etc.)
- [ ] #10 Public testimonials + case studies
- [ ] #15 "How it works" 20-second animation/video for homepage

### Priority G: High Priority (Soon)
- [ ] #4 Price recommendation engine — suggest fair pricing based on similar verified creators
- [ ] #6 Self-service WhatsApp commands (pause, export, delete, update)

### Priority H: Marketing & Growth
- [ ] Creator directory SEO play — build `stroby.ai/newsletters/[niche]` pages (organic traffic)
- [ ] Match celebration shareable — branded card after successful intro for social sharing
- [ ] Waitlist with referral priority ("Refer a friend to jump the queue")
- [ ] Creator leaderboard by niche (engagement, matches, ratings)
- [ ] Case study auto-generator after successful deals

### Priority G: Enterprise Roadmap
- [x] Meta webhook signature verification (HMAC-SHA256, fail-closed, constant-time comparison)
- [x] Batch scoring, engagement pre-ranking, cross-niche matching
- [x] Proactive engagement drips (day 1/3/7)
- [x] Rate limiting (30 msg/phone/hour)
- [x] Admin panel with conversations, analytics, manual matching
- [x] Admin growth dashboard (`/admin/growth`) — weekly signup charts, DAU, stickiness tracking
- [x] `/api/health` endpoint — Supabase connectivity check + response time
- [x] DB performance indexes — phone columns on all profile tables, agent_messages compound indexes
- [x] Parallelized admin stats queries (~400ms latency reduction)
- [x] Security hardening (2026-04-15): SSRF protection, constant-time auth, phone validation, LINK_ACCOUNT ownership verification, PROFILE_UPDATE type validation, field length caps, webhook sig fail-closed in prod
- [x] Intelligence API auth (Bearer token, crypto.timingSafeEqual)
- [x] Brand onboarding enhanced: website_url, buyer_description, past_newsletter_sponsors collected
- [x] "Preferred email in case WhatsApp disconnects" framing on both sides
- [ ] Referral system with unique codes and priority matching
- [ ] Monitoring & alerting (Sentry, uptime checks, token expiry alerts)
- [ ] Redis-backed rate limiting (current in-memory limiter doesn't persist across serverless instances)
- [ ] Vercel Pro + separate cron jobs
- [ ] Database hardening (real RLS policies, row-level encryption, soft deletes)
- [ ] WhatsApp template optimization (track last message time)
- [ ] Multi-channel readiness (email fallback, Telegram)
- [ ] Permanent WhatsApp token (automate renewal)
- [ ] Legal & compliance automation (GDPR export, automated purge, consent audit trail)
- [ ] AI voice call integration (Vapi/Bland.ai, opt-in only)

### Priority H: Operational
- [ ] Set up monitoring/alerts for webhook failures
- [ ] Set up monitoring for WhatsApp token expiry
- [ ] Remove debug logging from whatsapp.ts once stable

## Maybe / Explore Later
- [ ] #8 Soft gamification — streaks, milestones, "profile 100% complete for 12 days 🔥"
- [ ] #16 Public changelog / "what's new" page showing platform progress
- [ ] "New in your niche" real-time alerts — when a new business joins, ping creators in that niche
- [ ] Notification preferences (frequency control for users)
- [ ] Pause/unpause matching per user
- [ ] Group chat creation on WhatsApp for introductions

### Multi-platform matching v2 (parked from 2026-04-28 other_profiles incorporation plan)
- [ ] **Per-platform content_intelligence profilers.** v1 ships with thin/empty content_intelligence for non-newsletter creators (we don't read their content). Build platform-specific profilers later:
  - YouTube: pull captions via the YouTube Data API v3, run through Claude for audience profile + safety charges
  - Podcast: integrate Listen Notes API or transcribe via Whisper for top episodes
  - Instagram: scrape recent post captions + bios (TOS-grey; or use Instagram Graph API for owned channels)
  - TikTok: scrape video descriptions; transcript via Whisper if budget allows
  - LinkedIn: scrape recent posts (TOS-grey)
  - Twitter/X: pull recent tweets via X API v2 (need higher tier)
  Each profiler outputs the same content_intelligence shape Echo profiler produces today (audience_personas, topic_density, brand_safety_flags, vibe, one_line_pitch, charge scores).
- [ ] **Platform-specific pricing capture in onboarding.** v1 lets non-newsletter creators clear the eligibility gate via `open_to_inquiries=true` without naming a price. Add explicit per-platform price prompts later (CPM-based for podcast, flat per post for IG/TikTok, etc.) once we have brand-side signal on what works.
- [ ] **Tune effective-monthly-impressions multipliers from real data.** v1 uses industry-rough multipliers (newsletter × open_rate × 4 sends, IG × 0.1 × 30 posts, etc). Once 50+ deals close across multiple platforms, replace gut estimates with measured CPM-equivalent values.
- [ ] **Tune per-platform engagement thresholds from real data.** Same approach — current thresholds are educated guesses; refine after observing actual successful matches on each platform.

## Security & Compliance
- [ ] **Weekly full security audit** — every Monday, run a security sweep to catch regressions
  - Check all API routes for auth
  - Verify no hardcoded secrets or passwords
  - Confirm .env.local not in git history
  - Verify encryption hasn't regressed
  - Check rate limiting is still in place
  - Audit new endpoints added that week

## Infrastructure
- [x] CRON_SECRET on Vercel
- [x] ANTHROPIC_API_KEY on Vercel
- [x] All WhatsApp env vars on Vercel
- [x] All Stripe env vars on Vercel
- [x] META_APP_SECRET on Vercel

## Notes
- WhatsApp messaging is primary channel — AI voice calls allowed with explicit user consent
- Escrow via Stripe is optional — both parties can deal directly if they prefer
- Vercel Hobby plan: 1 daily cron max at 8am UTC (matching + appeal checks + reminders)
- PRD: /Users/joaquimmiro/Downloads/prd_2.md
- Supabase project: stroby-mvp (ref: uiizesgmliefjuvmpxeg)
- 3 DB tables for profiles: `newsletter_profiles`, `business_profiles`, `other_profiles`
- Introductions support both creator types via `creator_id` + `creator_type`
- Meta App ID: 1278038874427869
- All wa.me links use official message link: https://wa.me/message/2QFL7QR7EBZTD1
