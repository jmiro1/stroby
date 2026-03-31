# Stroby.ai — MVP TODO List

## Priority 1: Chat Widget Hybrid AI Upgrade
- [ ] Build `/api/chat` endpoint that sends user messages to Claude
- [ ] AI conversation phase: free-form chat to determine if user is newsletter owner or business
- [ ] Claude extracts context from natural language (e.g., "I run a SaaS newsletter" → newsletter owner)
- [ ] Once user type is confirmed, transition to structured survey (current step-by-step form)
- [ ] Handle edge cases: user picks wrong CTA button, gives mixed signals, changes mind
- [ ] AI should pre-fill survey fields from anything already mentioned in conversation

## Priority 2: Double Opt-In Introduction Flow (Phase 7)
- [ ] When matching job finds matches, send WhatsApp message to business with match details
- [ ] Business replies YES/NO/TELL ME MORE via WhatsApp → agent parses response
- [ ] On YES → update intro status to `business_accepted` → send WhatsApp to newsletter owner
- [ ] Newsletter owner replies YES/NO → update intro status
- [ ] On double opt-in → send email introduction connecting both parties
- [ ] Track introduction status through full state machine (suggested → accepted → introduced → completed)
- [ ] Auto-expire suggestions with no response after 72h

## Priority 3: Post-Placement Flow (Phase 8-9)
- [ ] Proof collection: after placement date, remind newsletter owner via WhatsApp to submit screenshot
- [ ] Screenshot upload handling (WhatsApp media → Supabase Storage `proof-screenshots` bucket)
- [ ] Notify business of delivery with results + 5-day appeal window
- [ ] Appeal handling: business can dispute, founder reviews manually
- [ ] Auto-payout: after appeal window expires with no dispute, release 85% via Stripe Transfer
- [ ] Follow-up: 1 week post-placement, request 1-5 rating from both sides
- [ ] Store ratings, update `avg_match_rating` on newsletter profile

## Priority 4: Newsletter Platform Verification (Phase 10)
- [ ] Beehiiv OAuth flow → fetch subscriber count, open rate, CTR
- [ ] ConvertKit OAuth flow → same
- [ ] Compare API metrics vs self-reported, auto-verify if within 10% tolerance
- [ ] Update `verification_status` to `api_verified`
- [ ] Substack/Mailchimp: screenshot verification fallback (already handled via WhatsApp media)

## Priority 5: Polish & Launch (Phase 11)
- [ ] End-to-end testing with test accounts (both onboarding flows → match → intro → payment → payout)
- [ ] Error handling for all edge cases (PRD Section 18)
- [ ] Rate limit enforcement (max 3 suggestions/week/business, max 2 intro requests/week/newsletter)
- [ ] Create OG image (1200x630 PNG at /public/og-image.png)
- [ ] Submit to Google Search Console + sitemap
- [ ] Landing page copy polish, add real network stats once available

## Infrastructure / Config
- [ ] Add API keys to Vercel env vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER, ANTHROPIC_API_KEY
- [ ] Add CRON_SECRET to Vercel for cron job auth
- [ ] Consider Vercel Pro upgrade for more cron jobs (currently limited to 1 daily)
- [ ] Set up Stripe webhook endpoint in Stripe dashboard pointing to https://stroby.ai/api/webhooks/stripe
- [ ] Set up Twilio WhatsApp webhook pointing to https://stroby.ai/api/webhooks/whatsapp
- [ ] Submit WhatsApp message templates to Twilio for approval (6 templates in PRD Section 11.2)

## Notes
- All communication is WhatsApp messaging only — no phone calls (international accessibility)
- Vercel Hobby plan: 1 daily cron max. Matching runs at 8am UTC. Appeals/updates need alternative trigger.
- PRD is at /Users/joaquimmiro/Downloads/prd_2.md
- Supabase project: stroby-mvp (ref: uiizesgmliefjuvmpxeg)
