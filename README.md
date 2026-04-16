# Stroby.ai

**Stroby.ai — a free WhatsApp-based superconnector AI that connects brands with newsletter creators for sponsorship partnerships.**

Production: [stroby.ai](https://stroby.ai) | Vercel project: `prj_IWit41cByxp3Ptw1Bb524freAKtT` | Supabase: `stroby-mvp`

## Architecture

```
┌──────────────────────────────────────────────────┐
│  Vercel (Next.js 16 + Turbopack)                 │
│  ─────────────────────────────                   │
│  WhatsApp webhook → AI agent → Supabase          │
│  Intelligence API → Haiku + Voyage AI embeddings │
│  Shadow profiles → claim flow                    │
│  Admin dashboard + analytics                     │
└─────────────────────┬────────────────────────────┘
                      │
         ┌────────────┼────────────┐
         ▼            ▼            ▼
  ┌────────────┐ ┌─────────┐ ┌──────────────┐
  │ Supabase   │ │ Stripe  │ │ Meta Cloud   │
  │ (Postgres  │ │ Connect │ │ WhatsApp API │
  │ + pgvector)│ │ Escrow  │ │              │
  └────────────┘ └─────────┘ └──────────────┘
```

**Separate repos:**
- **[jmiro1/stroby-leadgen](https://github.com/jmiro1/stroby-leadgen)** — lead-gen sidecar (Scrapy, Echo pipeline, Substack DMs, SQLite). Runs on Hostinger VPS at `/opt/stroby-leadgen/`.
- **[jmiro1/stroby-v1](https://github.com/jmiro1/stroby-v1)** — frozen archive of the pre-shadow-profiles app (tag `v1.0.0-pre-shadow`). See [REVERT.md](./REVERT.md).

## What's live

- **WhatsApp AI agent** — onboarding (creator + business), match discussion, profile updates, verification links
- **Matching Intelligence Engine** — Content Intelligence (Layer 1), Brand Intelligence (Layer 2), Semantic Matching (Layer 3, Voyage AI embeddings + cosine similarity)
- **Shadow profiles** — scraped brands/creators live in the DB as shadows, invisible to the app, visible to matching, with a `/claim/[token]` flow to promote
- **Double-opt-in introductions** — brand ↔ creator matches via WhatsApp, both sides must accept
- **Stripe escrow** (optional) — payment protection for deals
- **Affiliate program** — 10% commission for media buyers
- **Creator public profiles** — `/creator/[slug]` pages
- **Admin dashboard** — `/admin` with growth analytics, conversations, manual matching
- **Vercel Analytics + Speed Insights** — site-wide tracking

## Getting started (local dev)

```bash
npm install
cp .env.example .env.local  # fill in values from Vercel env vars
npm run dev
```

## Deploy

Pushes to `main` auto-deploy on Vercel. Env vars are in Vercel project settings — see [SHADOW_PROFILES_ENV.md](./SHADOW_PROFILES_ENV.md) for the shadow-specific ones.

## Key docs

| File | Purpose |
|---|---|
| [TODO.md](./TODO.md) | Full task list + roadmap |
| [SHADOW_PROFILES_PLAN.md](./SHADOW_PROFILES_PLAN.md) | Shadow profiles architecture (one DB, two views, claim flow) |
| [SHADOW_PROFILES_ENV.md](./SHADOW_PROFILES_ENV.md) | Env vars for shadow ingestion + claim tokens |
| [REVERT.md](./REVERT.md) | How to roll back to V1 if V2 breaks |
| [AFFILIATE_PRD.md](./AFFILIATE_PRD.md) | Affiliate program spec |

## Security

- All API routes use service-role Supabase (no client-side anon key)
- Shadow ingestion: `INGEST_SECRET` + `timingSafeEqual`
- Claim tokens: HMAC-SHA256 signed, TTL-bound, constant-time verify
- RLS on base tables hides shadows from non-service-role queries
- Views with `WITH CHECK OPTION` prevent accidental shadow writes from app code
- SSRF protection on all URL fetching (brand website scraping)
- Meta webhook signature verification (HMAC-SHA256, fail-closed)
- Phone/email validation on all input paths
- Field length caps (500 chars) on all user-submitted data
- Both repos are **private**
