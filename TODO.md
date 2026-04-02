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

## ~~Priority 5b: Polish & Launch~~ MOSTLY DONE
- [x] OG image exists at /public/og-image.png
- [x] Company name updated to Stroby AI Inc. (terms + privacy)
- [x] Rate limit: max 3 suggestions/week/business
- [x] Rate limit: max 2 intro requests/week/creator (newsletters + other creators)
- [ ] Submit to Google Search Console + sitemap
- [ ] End-to-end testing with test accounts (needs API keys)
- [ ] Error handling for edge cases (PRD Section 18) — basics done, idempotency/retries missing

## ~~Priority 6: WhatsApp Setup~~ DONE
- [x] Meta Cloud API integration (replaced Twilio)
- [x] WhatsApp Business Account: 1239088488387842
- [x] Phone Number ID: 1019203087947198 (+1 555 168 2562)
- [x] Env vars on Vercel (WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_VERIFY_TOKEN, WHATSAPP_BUSINESS_ACCOUNT_ID)
- [x] Webhook set: `https://stroby.ai/api/webhooks/whatsapp`
- [x] Subscribed to message events
- [ ] Register 7 WhatsApp message templates in Meta Business Manager (match_suggestion, intro_request, placement_reminder, follow_up, welcome, weekly_update, call_permission) — 24h validity
- [ ] Update code to use template messages for business-initiated conversations

## Priority 7: WhatsApp Landing Page
- [ ] Create a "Message me on WhatsApp" landing page with verification/cookie tracking
- [ ] Stroby character, headline, and a big WhatsApp CTA button
- [ ] Track conversions with cookie on click-through
- [ ] SEO-optimized (meta tags, JSON-LD, sitemap entry)

## ~~Priority 8: Stripe Setup~~ DONE
- [x] Stripe API keys on Vercel (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
- [x] Stripe webhook handler at `/api/webhooks/stripe` — handles checkout.session.completed, payment_intent.succeeded, account.updated
- [ ] Register webhook in Stripe Dashboard → `https://stroby.ai/api/webhooks/stripe`
- [ ] Test escrow flow end-to-end

## ~~Priority 9: Expanded Matching~~ DONE
- [x] Matching engine queries both `newsletter_profiles` and `other_profiles`
- [x] Business onboarding asks partner preference (newsletters only / creators only / all)
- [x] `partner_preference` column added to `business_profiles`
- [x] `creator_id` + `creator_type` columns added to `introductions`
- [x] Separate scoring prompts for newsletters vs. other creators
- [x] Introduction respond flow handles both creator types
- [x] Run-matching job sends appropriate messages for each creator type

## Infrastructure / Config
- [ ] Add `CRON_SECRET` to Vercel for cron job auth
- [ ] Consider Vercel Pro upgrade for more cron jobs (currently limited to 1 daily)
- [x] `ANTHROPIC_API_KEY` on Vercel

## Notes
- All communication is WhatsApp messaging — AI voice calls allowed with explicit user consent (call_permission template)
- Vercel Hobby plan: 1 daily cron max. Daily job runs matching + appeal checks + placement reminders
- PRD is at /Users/joaquimmiro/Downloads/prd_2.md
- Supabase project: stroby-mvp (ref: uiizesgmliefjuvmpxeg)
- 3 DB tables for profiles: `newsletter_profiles` (newsletters), `business_profiles` (businesses), `other_profiles` (other creators/influencers)
- Introductions now support both newsletter and other creator types via `creator_id` + `creator_type`
