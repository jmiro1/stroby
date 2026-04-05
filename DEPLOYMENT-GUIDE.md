# Stroby Platform — New Instance Deployment Guide

**Version:** April 5, 2026 (tag: `v1.0-april5-2026`)
**Original:** stroby.ai — AI Superconnector for native brand distribution

This guide explains everything needed to deploy a new instance of this platform for a different industry (e.g., import/export, real estate, recruiting, etc.).

---

## Architecture Overview

- **Frontend/Backend:** Next.js 16 (App Router) on Vercel
- **Database:** Supabase (PostgreSQL)
- **Messaging:** Meta WhatsApp Business Cloud API
- **Payments:** Stripe Connect (Express, escrow model)
- **AI:** Anthropic Claude (Haiku 4.5 for chat, vision for verification)
- **Encryption:** AES-256-GCM on all stored conversation content

---

## Step-by-Step Deployment

### 1. Clone the Repository

```bash
git clone https://github.com/jmiro1/stroby.git new-project-name
cd new-project-name
git checkout v1.0-april5-2026  # Start from the tagged version
rm -rf .git && git init  # Fresh git history
```

### 2. Create Supabase Project

1. Go to https://supabase.com → New Project
2. Note these values:
   - `NEXT_PUBLIC_SUPABASE_URL` (Project URL)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon/public key)
   - `SUPABASE_SERVICE_ROLE_KEY` (service_role key — keep secret)

3. Run all migrations in order:
```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Migrations create these tables:
- `newsletter_profiles` — creators/influencers (called "newsletter" but works for any creator type)
- `business_profiles` — businesses/buyers
- `other_profiles` — freeform users
- `introductions` — match records with double opt-in status
- `transactions` — escrow payment tracking
- `utm_clicks` — click tracking
- `agent_messages` — all WhatsApp conversation history (encrypted)
- `flagged_messages` — off-topic/suspicious messages for review
- `onboarding_events` — funnel analytics

4. Create a Supabase Storage bucket:
   - Name: `proof-screenshots` (set to public)
   - Used for: verification screenshots, creator avatars

### 3. Set Up Meta WhatsApp Business API

1. Go to https://developers.facebook.com → Create App → Business type
2. Add WhatsApp product to your app
3. Get a verified phone number (Meta Business verification required)
4. Note these values:
   - `WHATSAPP_PHONE_NUMBER_ID`
   - `WHATSAPP_BUSINESS_ACCOUNT_ID`
   - `WHATSAPP_ACCESS_TOKEN` (create a System User token for 60-day validity)
   - `META_APP_SECRET` (from App Settings → Basic)
5. Set webhook URL to: `https://YOUR-DOMAIN.com/api/webhooks/whatsapp`
6. Set verify token to match your `WHATSAPP_VERIFY_TOKEN` env var
7. Subscribe to `messages` webhook field

8. Register these message templates (all Utility except weekly_update which is Marketing):
   - `match_found_1` — "Hey {{1}}! ... I've found a great match... {{2}}"
   - `match_confirmation` — "Hi {{1}}, One of the... {{2}}"
   - `follow_up_feedback` — "Hi {{1}}, I hope that intro was helpful..."
   - `placement_reminder` — "Hey {{1}}, quick reminder... {{2}}"
   - `weekly_update` (Marketing) — "Hey {{1}}! Quick update... {{2}}"
   - `call_permission_1` — call permission request
   - `welcome_confirmation` — "Hi {{1}}, Your new account... {{2}}"

9. Set up data deletion callback URL: `https://YOUR-DOMAIN.com/api/meta/data-deletion`

### 4. Set Up Stripe

1. Go to https://dashboard.stripe.com
2. Enable Stripe Connect: https://dashboard.stripe.com/connect
   - Choose "Buyers will purchase from you" (escrow model)
   - Onboarding: "Hosted by Stripe" (Express)
   - Dashboard: "Express Dashboard"
3. Set up webhook endpoint: `https://YOUR-DOMAIN.com/api/webhooks/stripe`
   - Subscribe to: `checkout.session.completed`, `payment_intent.succeeded`, `account.updated`
4. Note these values:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

### 5. Get Anthropic API Key

1. Go to https://console.anthropic.com
2. Create an API key
3. Note: `ANTHROPIC_API_KEY`

### 6. Generate Encryption Key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Save as `ENCRYPTION_KEY`

### 7. Generate CRON_SECRET and ADMIN_PASSWORD

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```
Use for `CRON_SECRET` and choose a strong `ADMIN_PASSWORD`

### 8. Deploy to Vercel

```bash
npm install -g vercel
vercel login
vercel link  # or vercel init
```

Add ALL environment variables to Vercel (Production):
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=https://YOUR-DOMAIN.com
UTM_BASE_URL=https://YOUR-DOMAIN.com/r/
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_VERIFY_TOKEN=your-random-verify-token
WHATSAPP_BUSINESS_ACCOUNT_ID=
META_APP_SECRET=
ANTHROPIC_API_KEY=
ENCRYPTION_KEY=
CRON_SECRET=
ADMIN_PASSWORD=
```

Deploy:
```bash
vercel --prod --yes
```

Add custom domain in Vercel dashboard.

### 9. Set Up Cron Job

The `vercel.json` file already configures a daily cron:
```json
{
  "crons": [
    { "path": "/api/jobs/run-matching", "schedule": "0 8 * * *" }
  ]
}
```
This runs matching, engagement drips, post-intro followups, and monthly recaps.

---

## Customization for a Different Industry

### Files to Change for Rebranding

| What | File(s) | What to change |
|------|---------|---------------|
| **App name & tagline** | `src/app/layout.tsx` | Title, description, keywords, OG tags, JSON-LD |
| **Homepage** | `src/app/page.tsx` | Headline, subline, character image |
| **About page** | `src/app/about/page.tsx` | All copy, value props |
| **Character/Logo** | `public/logo-emoji.png`, `public/og-image.png`, favicons | Replace with new brand |
| **AI personality** | `src/lib/ai-agent.ts` | System prompt (who is the AI, what does it do) |
| **Onboarding prompt** | `src/lib/whatsapp-onboarding.ts` | Onboarding flow questions and personality |
| **Chat intro message** | `src/components/onboarding-chat.tsx` | Welcome message text |
| **Niche list** | `src/lib/constants.ts` | Replace NICHES array with industry-specific categories |
| **Niche affinity map** | `src/lib/niche-affinity.ts` | Map which categories are related |
| **Terms & Privacy** | `src/app/terms/page.tsx`, `src/app/privacy/page.tsx` | Company name, service description |
| **WhatsApp link** | Search for `wa.me/message/` | Replace with new WhatsApp message link |
| **LinkedIn/social** | `src/app/page.tsx`, `src/app/layout.tsx` | Social media URLs |
| **Matching prompt** | `src/lib/matching.ts` | Scoring prompt for the new industry context |
| **Profile fields** | `src/components/onboarding-chat.tsx` | Survey questions (e.g., "subscriber count" → "portfolio size") |
| **Engagement drips** | `src/lib/engagement-drips.ts` | Message copy |

### Key Concepts to Rename

The codebase uses "newsletter" and "business" internally. For a different industry:
- `newsletter_profiles` = the "supply side" (creators, exporters, agents, talent)
- `business_profiles` = the "demand side" (brands, importers, clients, employers)
- `introductions` = matches between supply and demand
- The table names don't need to change — just the user-facing copy

### Database: What to Keep vs. Change

**Keep as-is:** All table structures, indexes, RLS, encryption, agent_messages
**Change:** The niche CHECK constraints if any, and the constants in the app

---

## Admin Access

- **Dashboard:** `https://YOUR-DOMAIN.com/admin` (password: ADMIN_PASSWORD env var)
- **Analytics:** `https://YOUR-DOMAIN.com/admin/analytics`
- **Manual matching:** `https://YOUR-DOMAIN.com/admin/matches`
- **Stats page:** `https://YOUR-DOMAIN.com/s/stats`

---

## Token & Key Renewal Schedule

| What | Expires | How to renew |
|------|---------|-------------|
| WhatsApp System User Token | ~60 days | Meta Business Settings → System Users → Generate New Token |
| Stripe keys | Never | N/A |
| Anthropic API key | Never | N/A |
| Supabase keys | Never | N/A |
| Encryption key | Never | Do NOT rotate without migrating encrypted data |

---

## Daily Cron Job Runs

At 8am UTC daily, `/api/jobs/run-matching` runs:
1. Match businesses with creators (AI scoring)
2. Send engagement drips (day 1, 3, 7 after signup)
3. Post-intro followups (3 days after introduction)
4. Monthly recaps (1st of each month)

---

## Cost Estimates (per 100 active users)

- **Anthropic (Haiku):** ~$5-15/month (chat + matching + verification)
- **WhatsApp:** Free for user-initiated, ~$0.005-0.05/template message
- **Supabase:** Free tier covers up to ~500MB, 50k rows
- **Vercel:** Hobby is free (1 cron), Pro is $20/month (unlimited crons)
- **Stripe:** 2.9% + 30¢ per transaction (only on escrow deals)

---

## Security Notes

- All agent_messages content is AES-256-GCM encrypted at rest
- Meta webhook signature verification (HMAC-SHA256, fail-closed)
- Rate limiting: 30 messages/phone/hour
- Admin endpoints require ADMIN_PASSWORD
- No hardcoded secrets — all via environment variables
- Profile updates from AI are whitelisted to safe fields only
- Phone numbers in admin dashboard are masked
