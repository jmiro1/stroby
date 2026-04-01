# Stroby.ai — MVP TODO List

## ~~Priority 1: Chat Widget Hybrid AI Upgrade~~ DONE
- [x] Build `/api/chat` endpoint that sends user messages to Claude
- [x] Three onboarding paths: Business survey, Influencer survey, free-form Claude chat ("Other")
- [x] Claude extracts profile data from natural conversation (name, location, objectives, what they offer, etc.)
- [x] Dedicated `other_profiles` table with rich data for future matching
- [x] Conditional survey steps (e.g., "Other" niche → follow-up question)
- [x] Terms & Conditions consent step at end of all surveys

## ~~Priority 2: Double Opt-In Introduction Flow (Phase 7)~~ DONE
- [x] Matching job sends WhatsApp match suggestions to businesses
- [x] `/api/introductions/respond` handles accept/decline/tell_me_more for both sides
- [x] Double opt-in → sends confirmation to both parties via WhatsApp
- [x] `/api/introductions/book` creates transaction + Stripe Checkout + UTM link
- [x] AI agent detects intent from WhatsApp replies (accept/decline/rating phrases)
- [x] `/api/jobs/expire-introductions` auto-expires after 72h

## ~~Priority 3: Post-Placement Flow (Phase 8-9)~~ DONE
- [x] `/api/placements/proof` — newsletter owner submits clicks, opens, screenshot
- [x] `/api/placements/remind` — reminds newsletter owners about overdue placements
- [x] 5 business day appeal window calculation (skips weekends)
- [x] `/api/placements/appeal` — business files dispute
- [x] `/api/jobs/check-appeals` — auto-payout via Stripe Transfer after appeal expires
- [x] `/api/jobs/send-followups` — 1 week post-release, requests 1-5 rating
- [x] `/api/feedback` — collects ratings, recalculates avg_match_rating

## ~~Priority 4: Newsletter Platform Verification (Phase 10)~~ DONE
- [x] Beehiiv API: fetch subscribers, open rate, CTR
- [x] ConvertKit API: fetch subscriber count
- [x] Screenshot verification fallback
- [x] `/verify/[newsletterId]` page with tabbed form (Beehiiv/ConvertKit/Screenshot)
- [x] 10% tolerance comparison, API is source of truth

## ~~Priority 5a: Frontend Redesign~~ DONE
- [x] Boardy-style homepage with character image, "Hey, I'm Stroby", Message button
- [x] WhatsApp-style inline onboarding chat in phone mockup
- [x] Marketing content moved to /about page
- [x] Terms & Conditions page (`/terms`)
- [x] Privacy Policy page (`/privacy`) — GDPR/CCPA/PIPEDA compliant
- [x] SEO updated everywhere (title, meta, OG, Twitter, JSON-LD, sitemap)
- [x] Stroby character as logo, chat avatar, and favicon

## Priority 5b: Polish & Launch
- [ ] Create OG image (1200x630 PNG at /public/og-image.png) — use the Stroby character
- [ ] Submit to Google Search Console + sitemap
- [ ] End-to-end testing with test accounts (needs API keys)
- [ ] Error handling for all edge cases (PRD Section 18)
- [ ] Rate limit enforcement (max 3 suggestions/week/business, max 2 intro requests/week/newsletter)

## Priority 6: WhatsApp Setup (NEXT UP)
- [ ] Sign up for Twilio account
- [ ] Set up Twilio WhatsApp Business Profile (requires Facebook Business verification)
- [ ] Get approved WhatsApp sender number
- [ ] Add env vars to Vercel: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`
- [ ] Set Twilio webhook → `https://stroby.ai/api/webhooks/whatsapp`
- [ ] Submit 6 WhatsApp message templates to Twilio for approval (PRD Section 11.2)
- [ ] Test end-to-end: onboard → match → WhatsApp intro → accept/decline

## Priority 7: WhatsApp Landing Page
- [ ] Create a "Message me on WhatsApp" landing page (like boardy.ai/scan page)
- [ ] Stroby character, headline, and a big WhatsApp CTA button
- [ ] SEO-optimized (meta tags, JSON-LD, sitemap entry)
- [ ] **Blocked on:** WhatsApp number being live (Priority 6)

## Priority 8: Stripe Setup
- [ ] Add Stripe API keys to Vercel: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- [ ] Set up Stripe webhook endpoint → `https://stroby.ai/api/webhooks/stripe`
- [ ] Test escrow flow end-to-end

## Infrastructure / Config
- [ ] Add `CRON_SECRET` to Vercel for cron job auth
- [ ] Consider Vercel Pro upgrade for more cron jobs (currently limited to 1 daily)
- [ ] Add `ANTHROPIC_API_KEY` to Vercel env vars (may already be set)

## Notes
- All communication is WhatsApp messaging only — no phone calls (international accessibility)
- Vercel Hobby plan: 1 daily cron max. Daily job runs matching + appeal checks + placement reminders
- PRD is at /Users/joaquimmiro/Downloads/prd_2.md
- Supabase project: stroby-mvp (ref: uiizesgmliefjuvmpxeg)
- 3 DB tables: `newsletter_profiles` (influencers), `business_profiles` (businesses), `other_profiles` (everyone else)
