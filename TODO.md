# Stroby.ai — MVP TODO List

## Priority 1: Chat Widget Hybrid AI Upgrade
- [ ] Build `/api/chat` endpoint that sends user messages to Claude
- [ ] AI conversation phase: free-form chat to determine if user is newsletter owner or business
- [ ] Claude extracts context from natural language (e.g., "I run a SaaS newsletter" → newsletter owner)
- [ ] Once user type is confirmed, transition to structured survey (current step-by-step form)
- [ ] Handle edge cases: user picks wrong CTA button, gives mixed signals, changes mind
- [ ] AI should pre-fill survey fields from anything already mentioned in conversation

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

## Priority 5: Polish & Launch (Phase 11)
- [ ] End-to-end testing with test accounts (needs API keys)
- [ ] Error handling for all edge cases (PRD Section 18)
- [ ] Rate limit enforcement (max 3 suggestions/week/business, max 2 intro requests/week/newsletter)
- [ ] Create OG image (1200x630 PNG at /public/og-image.png)
- [ ] Submit to Google Search Console + sitemap
- [ ] Landing page copy polish, add real network stats once available

## Infrastructure / Config (needs your input)
- [ ] Add API keys to Vercel env vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER, ANTHROPIC_API_KEY
- [ ] Add CRON_SECRET to Vercel for cron job auth
- [ ] Consider Vercel Pro upgrade for more cron jobs (currently limited to 1 daily)
- [ ] Set up Stripe webhook endpoint in Stripe dashboard → https://stroby.ai/api/webhooks/stripe
- [ ] Set up Twilio WhatsApp webhook → https://stroby.ai/api/webhooks/whatsapp
- [ ] Submit WhatsApp message templates to Twilio for approval (6 templates in PRD Section 11.2)

## Notes
- All communication is WhatsApp messaging only — no phone calls (international accessibility)
- Vercel Hobby plan: 1 daily cron max. Daily job runs matching + appeal checks + placement reminders
- PRD is at /Users/joaquimmiro/Downloads/prd_2.md
- Supabase project: stroby-mvp (ref: uiizesgmliefjuvmpxeg)
