# Stroby.ai — MVP TODO List

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
- [ ] Submit sitemap to Google Search Console
- [ ] Create social media profiles (LinkedIn, X/Twitter — links already in nav)
- [ ] Onboard initial 30-50 newsletter owners / influencers
- [ ] Onboard initial 20 businesses
- [ ] Create sharable QR code for wa.me link
- [ ] Consider Vercel Pro for additional cron jobs (currently 1 daily on Hobby plan)

### Priority D: Feature Improvements
- [x] Auto-send Stripe Connect link when a deal is ready
- [x] Pre-AI intent classification (greetings, yes/no, ratings, stripe requests handled without AI)
- [x] Async webhook processing (return 200 immediately, process in background)
- [x] Conversation memory (summaries every 10 messages, stored on profile)
- [x] Profile auto-update from conversations ([PROFILE_UPDATE] marker)
- [x] Idempotency on webhook (unique index on whatsapp_message_id)
- [ ] AI voice call flow (call_permission template registered, needs voice API integration)
- [ ] Welcome template message for new signups (pending Meta approval)
- [ ] Dynamic URL in welcome_confirmation template (pass user ID)
- [ ] Add email as fallback communication channel

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
- [ ] Decline REASON tracking — ask users why they declined, learn from text not just niche
- [ ] Acceptance rate analysis — tune weights based on which scores convert
- [ ] Use concerns data to refine niche affinity map (find false positives)
- [ ] Track time-to-accept as a quality signal

**Level 3 (Deeper)**
- [ ] Audience geography overlap — collect region data, match by location
- [ ] Semantic embeddings for true audience similarity (beyond niche labels)
- [ ] A/B test different scoring prompts to optimize acceptance rates
- [ ] Collaborative filtering — "businesses like yours accepted these"
- [ ] Time-of-day / day-of-week optimization for match sending
- [ ] Match explainability page — click a link in the match message to see scoring breakdown

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
- [x] Meta webhook signature verification (HMAC-SHA256, fail-closed)
- [x] Batch scoring, engagement pre-ranking, cross-niche matching
- [x] Proactive engagement drips (day 1/3/7)
- [x] Rate limiting (30 msg/phone/hour)
- [x] Admin panel with conversations, analytics, manual matching
- [ ] Referral system with unique codes and priority matching
- [ ] Monitoring & alerting (Sentry, uptime checks, token expiry alerts)
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
