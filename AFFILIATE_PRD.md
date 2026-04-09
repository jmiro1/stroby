# Stroby Affiliate Program — PRD

> **Status:** APPROVED for build (2026-04-09). Phase 1 implementation in progress.
>
> **Owner:** Joaquim. Author of this doc: Claude (Claude Code session, 2026-04-09).
>
> **Why this doc exists:** This is the canonical, self-contained spec for the
> affiliate program. Future Claude sessions and humans should read this BEFORE
> touching any affiliate-related code, because it locks in design decisions
> that cost real time to debate. If you are about to make a change that
> conflicts with what's written here, update this doc first, then write the code.

---

## 1. Strategic context

Stroby is a two-sided marketplace that introduces brands to newsletter creators
and other content creators. Echo (the leadgen sidecar at `/leadgen/`) handles
creator-side acquisition automatically. The brand side is harder: brands have
budgets and decision-making power, and acquiring them requires either direct
sales (slow, expensive) or warm intros from people who already have brand
relationships.

**The affiliate program outsources brand acquisition to media buyers, growth
consultants, agency principals, and freelance newsletter sponsorship operators
who already broker deals manually on Slack and email today.** They do this
work either way. The affiliate program lets them do it inside Stroby and get
paid for it.

It is **two-sided** by design — affiliates can recommend either brands OR
creators, because both are scarce in different ways. A media buyer who knows
both sides should be able to introduce in either direction.

### Why this matters for Stroby's economics

The current Stroby take is **20% of gross deal value** (the platform fee).
The affiliate program pays **10% of gross to the affiliate**, **out of
Stroby's 20% take, NOT on top of it**. So:

- Brand pays $1,000
- Stroby's gross fee: $200
- Affiliate's commission: $100 (10% of gross)
- Stroby's net: $100
- Creator's payout: $800 (unchanged from non-affiliate deals)

On affiliate-touched deals, Stroby's effective margin drops from 20% to 10%.
**That is the cost of the channel** and is acceptable in early days because
it acquires both sides of the marketplace at zero direct CAC.

---

## 2. Locked-in design decisions

These were debated and decided on 2026-04-09. Do not change without explicit
discussion.

### D1. Commission base
**10% of gross deal value, paid out of Stroby's platform fee.**
Creators and brands see no difference whatsoever — same payout, same prices.
Only Stroby's net is reduced.

### D2. Both-side affiliate split
**5% / 5% when both sides have different affiliates.** If the SAME affiliate
brought both the brand and the creator, they get the full 10% (single
attribution, full payout).

### D3. Recurring vs one-time
**12-month attribution window from each party's signup date.** An affiliate
earns commission on every commissionable deal involving their introduced
party for 12 months from when that party's account was created. After 12
months, the relationship has matured and Stroby owns it — no more commission.

### D4. Attribution mechanism (4 paths, prioritized)
Resolution order at signup, **first-write-wins, no overwrites except admin override**:
1. **Manual intro form** (highest signal — affiliate filled out a form with the introduced party's email)
2. **Email match** against any pending manual intros (catches signups from a different device than the cookie)
3. **Code at signup** (user explicitly typed the affiliate's referral code)
4. **URL/cookie** (passive — visited an `/r/[code]` link, cookie was set)

### D5. Cookie window and lifetimes
- **Cookie window:** 30 days
- **Attribution lifetime to deals:** 12 months from signup (matches D3)
- **Manual intro pending validity:** 90 days. If the introduced party doesn't sign up within 90 days, the pending row expires.

### D6. Clawback policy
- Commission is created the moment a `transactions` row enters status `released` (i.e., the appeal window has passed and the creator has been paid).
- Commission row starts in `pending` status.
- **30-day hold:** after 30 days, status flips from `pending` to `payable`.
- **60-day post-payout clawback window:** if a refund happens within 60 days of an affiliate getting paid, a clawback row is created and netted against their next payout. Affiliates **never go negative** — clawbacks queue and wait for future positive earnings.
- After 60 days post-payout, the commission is permanently locked in.
- **Affiliates are notified of any clawback** — surprise clawbacks are a trust killer.

### D7. Payout method and frequency
- **Stripe Connect Express**, monthly payouts on the 1st of each month at 8am UTC.
- Reuses the same Stripe Connect infrastructure that creators already use (handles KYC, 1099 generation, ACH/wire/debit card payouts).
- **Minimum payout: $50.** Below that, the balance rolls forward to next month.
- **Hard dependency:** Stripe Connect must be enabled on Stroby's Stripe account. This is currently a TODO blocker (TODO.md "BLOCKER: Enable Stripe Connect"). Phase 1 ships without this — payouts are manual via wire/PayPal until Phase 2 unblocks Connect.

### D8. KYC and self-referral prevention
- Affiliates must complete Stripe Connect Express onboarding before any payout.
- Self-referral checks at signup time:
  - **Same email** as the affiliate → reject
  - **Same Stripe customer ID** → reject
  - **Same payout bank account** → flag for manual review
  - **Same IP within 30 minutes** → flag for manual review (don't auto-reject; people share networks)
- A creator OR business CAN ALSO be an affiliate (a media buyer who also writes a newsletter), but cannot affiliate-attribute their OWN account (`affiliates.{newsletter,business,other}_profile_id` reference is checked at attribution time).

### D9. Public dashboard vs private
**Affiliate dashboard is private to each affiliate.** Surfaces:
- Pipeline (introduced parties, signup status, days-since-intro)
- Pending commissions ($X awaiting clawback window)
- Payable commissions ($X queued for next payout)
- Lifetime earnings + lifetime intros
- Personal referral link + code
- Recent activity feed
- Stripe Connect onboarding status

**Public stats (non-individual):** at `/affiliates`, show "$X paid out to affiliates this year" for transparency without exposing individuals.

### D10. Admin tooling (minimum viable)
Two operations admins MUST have from day 1:
1. **Manual attribution override** — assign an affiliate to a profile retroactively (reason required, audit logged)
2. **Commission cancellation** — mark a commission as fraudulent / cancelled with a reason

Other admin features (fraud queue, leaderboard, payout history) are post-MVP.

### D11. Approval-gated signup (NEW, locked 2026-04-09)
The first 100 affiliates are **hand-curated**. Applications go to `pending`,
admin approves manually. The first 100 set the tone for the program — vet
them. After 100, can be relaxed to auto-approve.

### D12. Minimum deal size for commission (NEW, locked 2026-04-09)
**$200 gross.** Deals under $200 don't earn commission. This prevents affiliates
from gaming the system by brokering tons of cheap micro-deals.

### D13. Auth model (NEW, locked 2026-04-09)
**WhatsApp magic-link auth, NOT email.**

Stroby has no email sender today (TODO Priority D line 168 still pending).
Adding one for affiliate auth would be scope creep. Instead:
1. Affiliate applies with their **phone number** (in addition to email and name)
2. To log in, affiliate enters their phone at `/affiliates/login`
3. Backend looks them up, generates a signed magic-link token (HMAC, 15-min expiry, one-time use)
4. Token is sent via `sendWhatsAppMessage()` — Stroby's existing primary channel
5. Affiliate clicks the link → backend verifies the token → sets a signed session cookie (HMAC JWT, 30-day expiry)
6. Dashboard pages read the cookie

This reuses Stroby's existing WhatsApp infrastructure, requires zero new
dependencies, and is consistent with how every other Stroby user
communicates with the platform. Email is captured at application time but
only used as a future fallback channel.

**Session secret:** new env var `AFFILIATE_SESSION_SECRET` (random 32-byte hex).

### D14. Configurability via env vars
**Every commission rate, window, and threshold is configurable via env vars,
NOT hard-coded.** Single source of truth: `src/lib/affiliates/config.ts`.
Defaults are sensible, but every value can be overridden in Vercel without a
code deploy. Per-affiliate rate overrides are also supported via the
`affiliates.custom_rate_bps` column (null = use default).

### D15. Notifications channel
**WhatsApp** for all affiliate notifications:
- "New commission earned"
- "Payout sent"
- "Clawback applied" (with reason)
- "Application approved"
- "Application rejected"

Reuses `sendWhatsAppMessage()`. Same rationale as D13.

---

## 3. Configuration reference

All values live in `src/lib/affiliates/config.ts`, sourced from env vars with
sensible defaults. To change any of these in production, set the env var in
Vercel and redeploy.

| Env var | Default | Meaning |
|---|---|---|
| `STROBY_PLATFORM_FEE_BPS` | `2000` (20%) | Stroby's gross take per deal, in basis points |
| `AFFILIATE_DEFAULT_BPS` | `1000` (10%) | Default affiliate commission rate, in basis points |
| `AFFILIATE_SPLIT_BPS` | `500` (5%) | Per-side rate when both sides have different affiliates |
| `AFFILIATE_ATTRIBUTION_DAYS` | `365` | Attribution window from party signup to deal-eligible, in days |
| `AFFILIATE_COOKIE_DAYS` | `30` | Cookie persistence window |
| `AFFILIATE_PENDING_INTRO_DAYS` | `90` | How long a manual intro stays pending before expiring |
| `AFFILIATE_HOLD_DAYS` | `30` | Days from `pending` → `payable` (matches appeal window) |
| `AFFILIATE_CLAWBACK_DAYS` | `60` | Post-payout clawback window |
| `AFFILIATE_MIN_PAYOUT_CENTS` | `5000` ($50) | Minimum payout amount; below this rolls forward |
| `AFFILIATE_MIN_DEAL_CENTS` | `20000` ($200) | Minimum deal size eligible for commission |
| `AFFILIATE_SESSION_SECRET` | (required) | HMAC secret for signing session cookies + magic links |
| `AFFILIATE_AUTO_APPROVE` | `false` | If `true`, skip the admin approval step |

**Per-affiliate override:** `affiliates.custom_rate_bps INTEGER` column. If non-null, this overrides `AFFILIATE_DEFAULT_BPS` for that specific affiliate (e.g., a high performer gets 1500 = 15%).

---

## 4. Data model

All new tables go in migration `20240101000016_affiliate_program.sql`.

### Table: `affiliates`

```sql
CREATE TABLE affiliates (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                  TEXT NOT NULL UNIQUE,
  full_name              TEXT NOT NULL,
  display_name           TEXT,                    -- optional public alias
  phone                  TEXT NOT NULL,           -- required for WhatsApp magic-link auth
  bio                    TEXT,                    -- 1-2 line self-description for admin context
  network_description    TEXT,                    -- "tell us about your network" from application

  -- Referral mechanics
  referral_code          TEXT NOT NULL UNIQUE,    -- 8-char uppercase, alphanumeric, no confusable chars

  -- Stripe Connect (Phase 2)
  stripe_account_id      TEXT,
  stripe_payouts_enabled BOOLEAN NOT NULL DEFAULT false,

  -- Linked existing accounts (an affiliate can also be a creator/business/other)
  newsletter_profile_id  UUID REFERENCES newsletter_profiles(id),
  business_profile_id    UUID REFERENCES business_profiles(id),
  other_profile_id       UUID REFERENCES other_profiles(id),

  -- Status
  status                 TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'active', 'suspended', 'banned')),
  suspended_reason       TEXT,

  -- Per-affiliate rate override (null = use AFFILIATE_DEFAULT_BPS)
  custom_rate_bps        INTEGER,

  -- Tier (for future per-tier rates; only `standard` is used in MVP)
  tier                   TEXT NOT NULL DEFAULT 'standard'
                           CHECK (tier IN ('standard', 'silver', 'gold')),

  -- Lifetime stats (denormalized for fast dashboard reads)
  lifetime_referrals     INTEGER NOT NULL DEFAULT 0,
  lifetime_deals         INTEGER NOT NULL DEFAULT 0,
  lifetime_earned_cents  INTEGER NOT NULL DEFAULT 0,  -- gross earned (before clawbacks)
  lifetime_paid_cents    INTEGER NOT NULL DEFAULT 0,  -- net paid out

  -- Audit
  approved_at            TIMESTAMPTZ,
  approved_by_admin      TEXT,
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_affiliates_status ON affiliates(status);
CREATE INDEX idx_affiliates_code   ON affiliates(referral_code);
CREATE INDEX idx_affiliates_phone  ON affiliates(phone);
CREATE TRIGGER set_affiliates_updated_at BEFORE UPDATE ON affiliates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Table: `affiliate_referrals`

```sql
CREATE TABLE affiliate_referrals (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id           UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,

  -- What was referred (exactly one is non-null after binding)
  newsletter_profile_id  UUID REFERENCES newsletter_profiles(id) ON DELETE SET NULL,
  business_profile_id    UUID REFERENCES business_profiles(id)   ON DELETE SET NULL,
  other_profile_id       UUID REFERENCES other_profiles(id)      ON DELETE SET NULL,

  -- For pending intros where the introduced party hasn't signed up yet
  pending_email          TEXT,
  pending_name           TEXT,
  pending_role           TEXT CHECK (pending_role IN ('newsletter', 'business', 'other')),
  pending_intro_note     TEXT,                    -- affiliate's note about the intro

  -- Attribution mechanism
  attribution_method     TEXT NOT NULL CHECK (attribution_method IN
                           ('manual_intro', 'email_match', 'cookie',
                            'code_at_signup', 'admin_override')),
  attribution_metadata   JSONB,                   -- {ip_hash, user_agent, utm, ...}

  -- Lifecycle
  status                 TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'signed_up', 'expired',
                                             'rejected_self_referral', 'admin_revoked')),
  signed_up_at           TIMESTAMPTZ,
  expires_at             TIMESTAMPTZ NOT NULL,    -- 90 days from creation if pending

  -- Audit
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT one_referral_target CHECK (
    (newsletter_profile_id IS NOT NULL)::int +
    (business_profile_id   IS NOT NULL)::int +
    (other_profile_id      IS NOT NULL)::int +
    (pending_email         IS NOT NULL)::int >= 1
  )
);

CREATE INDEX idx_referrals_affiliate     ON affiliate_referrals(affiliate_id);
CREATE INDEX idx_referrals_pending_email ON affiliate_referrals(lower(pending_email))
  WHERE pending_email IS NOT NULL AND status = 'pending';
CREATE INDEX idx_referrals_status        ON affiliate_referrals(status);
CREATE INDEX idx_referrals_newsletter    ON affiliate_referrals(newsletter_profile_id) WHERE newsletter_profile_id IS NOT NULL;
CREATE INDEX idx_referrals_business      ON affiliate_referrals(business_profile_id)   WHERE business_profile_id   IS NOT NULL;
CREATE INDEX idx_referrals_other         ON affiliate_referrals(other_profile_id)      WHERE other_profile_id      IS NOT NULL;
CREATE TRIGGER set_referrals_updated_at BEFORE UPDATE ON affiliate_referrals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Table: `affiliate_commissions`

```sql
CREATE TABLE affiliate_commissions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id           UUID NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,
  referral_id            UUID NOT NULL REFERENCES affiliate_referrals(id) ON DELETE RESTRICT,
  transaction_id         UUID NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,

  -- Commission math (all in cents)
  deal_gross_cents       INTEGER NOT NULL,        -- transactions.amount snapshot
  commission_rate_bps    INTEGER NOT NULL,        -- snapshot at time of earning
  commission_cents       INTEGER NOT NULL,        -- floor(gross * rate / 10000); negative for clawbacks

  -- Which side this affiliate brought
  attributed_side        TEXT NOT NULL CHECK (attributed_side IN ('brand', 'creator', 'both')),

  -- Lifecycle
  status                 TEXT NOT NULL DEFAULT 'pending' CHECK (status IN
                           ('pending',          -- inside 30-day hold
                            'payable',          -- past hold, awaiting next payout
                            'paid',             -- transferred to affiliate's stripe account
                            'clawback_pending', -- refund happened, debit waiting for next payout
                            'clawback_applied', -- debit successfully applied
                            'cancelled')),      -- admin cancelled (fraud, dispute, refund pre-payout)
  cancelled_reason       TEXT,
  payable_at             TIMESTAMPTZ,            -- when 'pending' → 'payable'
  paid_at                TIMESTAMPTZ,
  payout_id              UUID,                   -- FK to affiliate_payouts (added after that table created)

  -- Audit
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_commissions_affiliate ON affiliate_commissions(affiliate_id);
CREATE INDEX idx_commissions_status    ON affiliate_commissions(status);
CREATE INDEX idx_commissions_payable   ON affiliate_commissions(payable_at) WHERE status = 'payable';
CREATE INDEX idx_commissions_txn       ON affiliate_commissions(transaction_id);
CREATE TRIGGER set_commissions_updated_at BEFORE UPDATE ON affiliate_commissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Table: `affiliate_payouts`

```sql
CREATE TABLE affiliate_payouts (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id           UUID NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,
  amount_cents           INTEGER NOT NULL,        -- can be negative if net of clawbacks
  commission_count       INTEGER NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'queued' CHECK (status IN
                           ('queued', 'processing', 'paid', 'failed', 'reversed')),
  stripe_transfer_id     TEXT,
  failure_reason         TEXT,
  period_start           DATE NOT NULL,
  period_end             DATE NOT NULL,
  paid_at                TIMESTAMPTZ,
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_payouts_affiliate ON affiliate_payouts(affiliate_id);
CREATE INDEX idx_payouts_status    ON affiliate_payouts(status);
CREATE TRIGGER set_payouts_updated_at BEFORE UPDATE ON affiliate_payouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Now add the FK from commissions back to payouts
ALTER TABLE affiliate_commissions
  ADD CONSTRAINT fk_commissions_payout
  FOREIGN KEY (payout_id) REFERENCES affiliate_payouts(id) ON DELETE SET NULL;
```

### Table: `affiliate_sessions`

For WhatsApp magic-link auth + dashboard sessions.

```sql
CREATE TABLE affiliate_sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id       UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  -- Session state
  token_hash         TEXT NOT NULL UNIQUE,        -- sha256(opaque random token)
  -- Magic link state (set when issuing, cleared when consumed)
  magic_token_hash   TEXT,                        -- sha256 of one-time magic token
  magic_expires_at   TIMESTAMPTZ,
  magic_consumed_at  TIMESTAMPTZ,
  -- Session lifetime
  ip_hash            TEXT,
  user_agent         TEXT,
  expires_at         TIMESTAMPTZ NOT NULL,
  revoked_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sessions_affiliate     ON affiliate_sessions(affiliate_id);
CREATE INDEX idx_sessions_token_hash    ON affiliate_sessions(token_hash);
CREATE INDEX idx_sessions_magic_hash    ON affiliate_sessions(magic_token_hash) WHERE magic_token_hash IS NOT NULL;
```

### Modifications to existing tables

**Surgical additions, no destructive changes:**

```sql
ALTER TABLE newsletter_profiles ADD COLUMN affiliate_id UUID REFERENCES affiliates(id);
ALTER TABLE business_profiles   ADD COLUMN affiliate_id UUID REFERENCES affiliates(id);
ALTER TABLE other_profiles      ADD COLUMN affiliate_id UUID REFERENCES affiliates(id);

CREATE INDEX idx_newsletters_affiliate ON newsletter_profiles(affiliate_id) WHERE affiliate_id IS NOT NULL;
CREATE INDEX idx_businesses_affiliate  ON business_profiles(affiliate_id)   WHERE affiliate_id IS NOT NULL;
CREATE INDEX idx_other_affiliate       ON other_profiles(affiliate_id)      WHERE affiliate_id IS NOT NULL;
```

The existing `referral_source` text columns stay — they remain useful for
generic UTM source tracking. The new `affiliate_id` columns are the
**canonical attribution anchor** that the commission engine reads.

---

## 5. Code structure

All affiliate code lives under these paths.

### Backend modules (`src/lib/affiliates/`)

```
src/lib/affiliates/
├── config.ts          — env-var-driven configuration constants
├── codes.ts           — referral code generation (8-char, no confusables)
├── attribution.ts     — resolution chain (manual / email / code / cookie)
├── commissions.ts     — recordCommissionForTransaction() + math
├── auth.ts            — WhatsApp magic-link + session HMAC sign/verify
├── notify.ts          — WhatsApp notification helpers (commission, payout, clawback)
├── queries.ts         — Supabase query helpers
└── types.ts           — TypeScript types matching the DB schema
```

### API routes (`src/app/api/affiliates/`)

```
src/app/api/affiliates/
├── apply/route.ts                      — POST: submit application
├── login/route.ts                      — POST: request magic link via WhatsApp
├── login/verify/route.ts               — POST: consume magic token, set session cookie
├── logout/route.ts                     — POST: revoke session
├── me/route.ts                         — GET:  current affiliate's profile + stats
├── me/intros/route.ts                  — POST/GET: manual intros
├── me/commissions/route.ts             — GET:  list commissions with filters
├── me/payouts/route.ts                 — GET:  list payout history
├── me/stripe-connect/route.ts          — POST: generate Stripe Connect onboarding link (Phase 2)
└── validate-code/route.ts              — POST: check a referral code is valid (used at signup)
```

### Public-facing routes

```
src/app/r/[code]/route.ts               — GET:  cookie-set + redirect to /
```

### Cron jobs

```
src/app/api/jobs/affiliate-payouts/route.ts        — monthly payout cycle (Phase 2)
src/app/api/jobs/affiliate-attribution-cleanup/route.ts — expire stale pending intros (daily)
```

### Admin routes (`src/app/api/admin/affiliates/`)

```
src/app/api/admin/affiliates/route.ts                       — GET: list pending/active
src/app/api/admin/affiliates/[id]/approve/route.ts          — POST: approve application
src/app/api/admin/affiliates/[id]/reject/route.ts           — POST: reject application
src/app/api/admin/affiliates/[id]/override-attribution/route.ts — POST: manual attribution
src/app/api/admin/affiliates/[id]/cancel-commission/route.ts    — POST: cancel a commission
```

### Frontend pages (`src/app/affiliates/`)

```
src/app/affiliates/page.tsx                     — public landing
src/app/affiliates/apply/page.tsx               — application form
src/app/affiliates/login/page.tsx               — phone entry → request magic link
src/app/affiliates/login/sent/page.tsx          — "check your WhatsApp" confirmation
src/app/affiliates/login/verify/page.tsx        — magic-link landing (consumes token, sets cookie)
src/app/affiliates/dashboard/page.tsx           — main dashboard (auth required)
src/app/affiliates/dashboard/intros/page.tsx    — intro pipeline
src/app/affiliates/dashboard/intros/new/page.tsx — manual intro form
src/app/affiliates/dashboard/commissions/page.tsx — commission history
src/app/affiliates/dashboard/payouts/page.tsx   — payout history
src/app/affiliates/dashboard/settings/page.tsx  — profile + payout method
```

### Admin pages (`src/app/admin/affiliates/`)

```
src/app/admin/affiliates/page.tsx               — list with approve/reject buttons
src/app/admin/affiliates/[id]/page.tsx          — detail view
```

### Modifications to existing files

These are surgical additions, not rewrites:

1. **`src/app/api/onboard/route.ts`** — read affiliate cookie + validate any submitted code, set `affiliate_id` on the new profile, create an `affiliate_referrals` row
2. **`src/app/api/jobs/check-appeals/route.ts`** — after Stripe transfer succeeds and transaction is marked `released`, call `recordCommissionForTransaction(transactionId)`
3. **`src/app/api/webhooks/stripe/route.ts`** — handle `charge.refunded` events to trigger clawback flow

---

## 6. User flows

### Flow A: Affiliate signup
1. Visitor lands on `/affiliates` (public landing page explaining the program)
2. Clicks "Apply" → fills out `/affiliates/apply` (email, phone, full name, optional bio, network description)
3. POST `/api/affiliates/apply` creates `affiliates` row with `status='pending'`, generates a unique `referral_code`
4. Admin gets a WhatsApp notification (notification helper sends to admin phone from env)
5. Admin reviews at `/admin/affiliates`, clicks Approve or Reject
6. Approval flips status to `active`, sets `approved_at`, sends WhatsApp to affiliate: "Welcome — here's your referral link and code"
7. Affiliate receives WhatsApp with their personal `stroby.ai/r/CODE` link

### Flow B: Affiliate login (magic link)
1. Affiliate visits `/affiliates/login`, enters phone number
2. POST `/api/affiliates/login` → looks up affiliate by phone, generates random 32-byte magic token, hashes it (sha256), stores `magic_token_hash` + `magic_expires_at` (15 min) in `affiliate_sessions`
3. Sends WhatsApp message: "Tap to log in: stroby.ai/affiliates/login/verify?t=TOKEN" (the unhashed token)
4. Affiliate taps the link → frontend page POSTs `/api/affiliates/login/verify` with the token
5. Backend hashes the submitted token, finds the matching session row, checks not expired, not consumed, then:
   - Marks `magic_consumed_at = now()`
   - Generates a session token (random 32-byte hex), stores its hash as `token_hash`
   - Sets `expires_at = now() + 30 days`
   - Returns the unhashed session token in a Set-Cookie header (`stroby_aff_session`, HttpOnly, Secure, SameSite=Lax)
6. Affiliate is redirected to `/affiliates/dashboard`

### Flow C: Referral creation (4 paths)

**Path 1: URL/cookie**
- Affiliate shares `stroby.ai/r/MIRO10`
- `/r/[code]` route looks up affiliate, sets `stroby_aff` cookie (30 days, HttpOnly, Secure, SameSite=Lax) with the affiliate ID, redirects to `/`
- User browses normally
- When they sign up via the chat widget, `/api/onboard/route.ts` reads the cookie and stores `affiliate_id` on the new profile, creates `affiliate_referrals` row with `attribution_method='cookie'`

**Path 2: Code at signup**
- Onboarding chat asks (only if no cookie): "Were you referred by someone? Drop their code if so."
- User enters code → POST `/api/affiliates/validate-code` → if valid, the affiliate ID is stored on the new profile, referral row created with `attribution_method='code_at_signup'`

**Path 3: Manual intro**
- Affiliate uses dashboard form `/affiliates/dashboard/intros/new`: name, email, role, optional intro note
- POST `/api/affiliates/me/intros` creates a `pending` `affiliate_referrals` row with `pending_email`, `pending_name`, `pending_role`, no profile FK yet
- Stroby sends a WhatsApp message to the introduced party (if phone provided) AND the dashboard generates a personal one-time intro link the affiliate can share manually
- When the introduced party signs up, attribution is bound (see Path 4)

**Path 4: Email match (background)**
- On every profile creation, `/api/onboard/route.ts` checks: is there a pending `affiliate_referrals` row whose `pending_email` matches this profile's email?
- If yes, bind it: set the profile FK, flip `status='signed_up'`, set `attribution_method='email_match'`

**Resolution priority** when multiple paths match:
1. Manual intro / email match (warmest signal)
2. Code at signup (explicit)
3. Cookie (passive)

First-write-wins. Once `affiliate_id` is set on a profile, no later attribution overwrites it. **Only admin override can change it post-hoc.**

### Flow D: Commission calculation (the key event)

**Trigger:** A `transactions` row enters status `released` (in `/api/jobs/check-appeals` after the appeal window passes).

**Logic** (in `lib/affiliates/commissions.ts → recordCommissionForTransaction()`):
1. Fetch transaction + introduction → get business_id and either newsletter_id or other_id
2. Look up `affiliate_id` on each side's profile
3. Check 12-month attribution window: if profile's `created_at` > `AFFILIATE_ATTRIBUTION_DAYS` ago, skip that side
4. Check minimum deal size: if `transaction.amount < AFFILIATE_MIN_DEAL_CENTS`, no commission, exit
5. Cases:
   - **Neither side affiliated** → no commission
   - **Only one side affiliated** → one commission row, `attributed_side` = `'brand'` or `'creator'`, rate = affiliate's `custom_rate_bps` ?? `AFFILIATE_DEFAULT_BPS`
   - **Both sides affiliated, same affiliate** → one row, `attributed_side='both'`, full rate
   - **Both sides affiliated, different affiliates** → two rows, each at `AFFILIATE_SPLIT_BPS` (5% each)
6. Each row: `commission_cents = floor(deal_gross_cents * commission_rate_bps / 10000)`
7. Each row starts in `status='pending'`, `payable_at = now() + AFFILIATE_HOLD_DAYS days`
8. Update affiliate `lifetime_referrals` (no), `lifetime_deals` (yes), `lifetime_earned_cents` (yes)
9. Send WhatsApp notification to each affiliate: "You earned $X commission on a deal with [creator name]"

### Flow E: Payout cycle (Phase 2, monthly cron)

**Trigger:** New cron `/api/jobs/affiliate-payouts` runs on the 1st of each month at 8am UTC.

**Logic** (per active affiliate with `stripe_payouts_enabled=true`):
1. SELECT FOR UPDATE the affiliate row (concurrency safety)
2. Find all `payable` commissions
3. Find all `clawback_pending` commissions (negative amounts)
4. Net = sum of positive - sum of clawbacks
5. If `net >= AFFILIATE_MIN_PAYOUT_CENTS`:
   - Create `affiliate_payouts` row with the net amount, count, status `processing`
   - Stripe Connect transfer to affiliate's connected account
   - On success: status `paid`, link all commissions to this payout row, flip their statuses to `paid`/`clawback_applied`
   - On failure: status `failed`, capture reason, alert admin via WhatsApp
6. If `net < min`: roll forward, no payout this cycle
7. Update affiliate `lifetime_paid_cents`
8. Send WhatsApp to affiliate: "Payout of $X sent to your account"

### Flow F: Clawback (refund handling)

**Trigger:** Stripe webhook `charge.refunded` for a transaction that has affiliate commissions.

**Logic**:
1. Find all `affiliate_commissions` rows for the refunded transaction
2. For each:
   - If `status='pending'` or `'payable'` (not yet paid out): flip to `cancelled`, reason `'refund'`, decrement affiliate's `lifetime_earned_cents`
   - If `status='paid'`: create a NEW commission row with negative `commission_cents`, `status='clawback_pending'`, link to the original via `cancelled_reason='clawback for {original_id}'`
3. Send WhatsApp to affected affiliates: "Heads up — $X was clawed back due to a refund on deal [name]. It will be netted against your next payout."

---

## 7. Anti-fraud table

| Risk | Mitigation |
|---|---|
| Self-referral | Email match, IP match within 30 min, Stripe customer ID match, payout bank match |
| Sock-puppet brands | Stripe Connect KYC gates payout. Fake brands can't pay real money. |
| Cookie stuffing | 30-day cookie window. Cookie is the WEAKEST attribution signal. Bot traffic detection. |
| Multi-affiliate disputes | First-write-wins at DB level. Admin can override with audit log. |
| Refund-after-payout | 30-day pre-payout hold + 60-day post-payout clawback window |
| Cheap-deal pumping | $200 minimum deal size for commission eligibility |
| Misrepresentation by affiliates | Affiliate Agreement explicitly forbids guarantees. Admin can suspend. |
| Account takeover | Stripe Connect handles payout details independently of Stroby login |
| Magic-link token replay | One-time tokens, 15-min expiry, hashed at rest, marked `magic_consumed_at` on use |
| Session token theft | HttpOnly + Secure + SameSite=Lax cookies, 30-day expiry, server-side revocation |

---

## 8. Phased build

### Phase 1 — MVP (this build, ~5 days of work)

**Database:**
- Migration `20240101000016_affiliate_program.sql` creating all 5 affiliate tables + 3 ALTER TABLE additions

**Backend lib:**
- `src/lib/affiliates/config.ts`
- `src/lib/affiliates/codes.ts`
- `src/lib/affiliates/attribution.ts`
- `src/lib/affiliates/commissions.ts`
- `src/lib/affiliates/auth.ts`
- `src/lib/affiliates/notify.ts`
- `src/lib/affiliates/queries.ts`
- `src/lib/affiliates/types.ts`

**API routes:**
- All routes under `src/app/api/affiliates/*` listed in §5
- `/r/[code]` route
- Modify `/api/onboard/route.ts` to read cookie / validate code
- Modify `/api/jobs/check-appeals/route.ts` to call `recordCommissionForTransaction()`

**Admin:**
- `/api/admin/affiliates/*` routes for approve/reject/override/cancel
- `/admin/affiliates` page

**Frontend:**
- `/affiliates` landing page
- `/affiliates/apply` form
- `/affiliates/login` + `/affiliates/login/sent` + `/affiliates/login/verify`
- `/affiliates/dashboard` and sub-pages

**OUT OF Phase 1:**
- Stripe Connect Express onboarding (Phase 2 — depends on Connect being enabled at the Stripe account level, currently a TODO blocker)
- Automated monthly payout cycle (Phase 2)
- Automated clawback on Stripe webhook (Phase 2)
- Public stats page
- Tier system (everyone is `standard`)

**Phase 1 completion definition:** an affiliate can apply, get approved via admin, log in via WhatsApp magic link, view dashboard, generate referral link, refer someone via cookie/code/manual intro, and when that person signs up + does a deal, a commission row is created with the right amount. Payouts are still done manually by admin running a SQL update + sending a wire/PayPal.

### Phase 2 — Stripe Connect + automated payouts (~3 days)

Prerequisites: Stripe Connect enabled at the account level (BLOCKER on TODO.md).

- Stripe Connect Express onboarding flow
- Webhook handler for affiliate Connect account.updated
- `/api/jobs/affiliate-payouts` cron — monthly
- Clawback flow on Stripe `charge.refunded` webhook
- Affiliate dashboard payouts page

### Phase 3 — Maturation (when there are >50 active affiliates, ~5 days)

- Tier system (silver = 15%, gold = 20%, threshold-based)
- Public stats page ("$X paid to affiliates this year")
- Anonymized leaderboard
- Echo integration: auto-attribute creators an affiliate manually introduced and Echo later confirmed
- Multi-touch attribution analysis
- Quarterly bonus structure

---

## 9. Open questions for future iteration

These do NOT block Phase 1 — they're decisions to revisit once we have data.

1. **Should we allow affiliates to refer OTHER affiliates?** Multi-level marketing has obvious risks but moderate sub-tier rewards (e.g., 1% of a sub-affiliate's earnings) could compound network growth. Defer to Phase 3.
2. **Do creators / businesses ever see their attributed affiliate?** Currently no — affiliate is invisible to the introduced party. Pro: keeps relationships clean. Con: removes a trust signal. Defer.
3. **Annual reset of attribution windows?** Should the 12-month window restart if the introduced party becomes inactive then comes back? Defer until we see this case.
4. **Public profile for top affiliates?** A "Stroby Pro Network" badge / page that high-tier affiliates can link from their own sites. Defer to Phase 3.

---

## 10. Operational notes

### Changing the commission rate

To change the default commission rate platform-wide (e.g., from 10% to 8% or 12%):
1. Set `AFFILIATE_DEFAULT_BPS` env var in Vercel (e.g., `800` for 8%, `1200` for 12%)
2. Redeploy
3. **All FUTURE commissions** will use the new rate. Existing rows are unaffected (they snapshotted the rate at creation time).

### Granting a custom rate to one affiliate

Update their row directly:
```sql
UPDATE affiliates SET custom_rate_bps = 1500 WHERE referral_code = 'MIRO10';  -- 15%
```

### Disputing or cancelling a commission

Admin uses `/api/admin/affiliates/[id]/cancel-commission` (which expects a reason). The commission status flips to `cancelled` and the affiliate's lifetime stats are decremented. If the commission was already `paid`, a clawback row is created instead.

### Manually attributing a profile to an affiliate (post-hoc)

Admin uses `/api/admin/affiliates/[id]/override-attribution` providing the profile type and ID. This:
1. Sets the `affiliate_id` on the profile
2. Creates an `affiliate_referrals` row with `attribution_method='admin_override'` and a required reason in `attribution_metadata.note`
3. Audit trail preserved

### Suspending an affiliate

```sql
UPDATE affiliates SET status='suspended', suspended_reason='reason here' WHERE id='...';
```

While suspended:
- Existing commissions continue to vest and pay out normally (we honor what was earned)
- New referrals do NOT get attributed (the cookie / code lookup checks `status='active'`)
- Affiliate cannot log in to dashboard

### Permanently banning an affiliate

```sql
UPDATE affiliates SET status='banned', suspended_reason='reason' WHERE id='...';
```

Same effects as suspended PLUS all unpaid commissions are cancelled.

---

## 11. Compliance and legal

This section is the spec for the eventual `/affiliates/terms` page and the
underlying agreement. It does NOT replace actual legal review.

- **Affiliate Agreement** required before status can flip from `pending` to `active`. Checkbox at application time captures consent + timestamp.
- **Key clauses to include:**
  - 12-month attribution window
  - 30-day commission hold + 60-day post-payout clawback
  - No guarantees about earnings, matches, or revenue
  - Stroby reserves the right to suspend or cancel commissions for fraud or T&C violation
  - Tax responsibility on the affiliate
  - Termination clauses (Stroby can terminate the program with 30 days notice; vested commissions paid out)
  - Governing law: Stroby AI Inc. (jurisdiction TBD by user)
- **Privacy:** Affiliate cookies disclosed in privacy policy, listed in cookie disclosure
- **1099 generation:** Stripe Connect handles this automatically for US affiliates earning >$600/year. Non-US is the affiliate's responsibility but emphasized at onboarding.
- **GDPR / data deletion:** Affiliates included in the existing `/api/meta/data-deletion` flow. `affiliate_referrals` and `affiliate_commissions` are financial records and retained per legal requirements (anonymized after 7 years).
- **FTC disclosure:** Affiliates promoting Stroby externally must disclose the relationship. Surface this as a checkbox in the application form.

---

## 12. Definition of done — Phase 1

Phase 1 is complete when ALL of the following are true:

- [ ] Migration `20240101000016_affiliate_program.sql` runs cleanly on a fresh database
- [ ] All 5 affiliate tables exist with the right indexes
- [ ] `affiliate_id` columns exist on all 3 profile tables
- [ ] An admin can submit a test application via the form, see it in `/admin/affiliates`, click Approve, and the affiliate gets a WhatsApp welcome message
- [ ] The affiliate can log in via `/affiliates/login` using WhatsApp magic link
- [ ] The affiliate sees their dashboard with their referral code and link
- [ ] Visiting `/r/[code]` sets the cookie and redirects to `/`
- [ ] Signing up via the chat widget after visiting an `/r/[code]` link sets `affiliate_id` on the new profile and creates an `affiliate_referrals` row
- [ ] Submitting a manual intro via the dashboard creates a `pending` referral row
- [ ] When a transaction is marked `released` by `/api/jobs/check-appeals`, a commission row is created with the right `commission_cents`
- [ ] Commission math is verified: $1000 deal × 10% = $10000 cents; $1000 deal × both-side split = $5000 cents each
- [ ] Admin can cancel a commission with a reason
- [ ] All Phase 1 routes return reasonable error responses for invalid input
- [ ] The PRD is up to date with any deviations made during build

---

## 13. Build progress (live, updated as work happens)

### 2026-04-09 — initial build (Phase 1 backend ~80% complete)

**Shipped:**
- ✅ PRD committed
- ✅ Migration `20240101000016_affiliate_program.sql` — 5 tables, 3 ALTER TABLEs, all indexes + RLS
- ✅ All 8 backend lib modules under `src/lib/affiliates/`:
  - `config.ts` (env-var-driven config + commission math helpers + `assertConfigValid()`)
  - `types.ts` (TS types matching schema)
  - `codes.ts` (referral code generation, no-confusable alphabet, retry on collision)
  - `auth.ts` (WhatsApp magic-link issue + verify, session HMAC, hashIp helper)
  - `notify.ts` (WhatsApp notification helpers — application/commission/clawback/payout)
  - `attribution.ts` (4-path resolution chain with self-referral protection)
  - `commissions.ts` (`recordCommissionForTransaction()` — the heart, all 4 cases + clawback)
  - `queries.ts` (Supabase query helpers + `getCommissionTotals()`)
- ✅ Critical API routes:
  - `GET  /r/[code]` — cookie set + redirect
  - `POST /api/affiliates/apply` — submit application
  - `POST /api/affiliates/login` — request magic link via WhatsApp
  - `POST /api/affiliates/login/verify` — consume token, set session cookie
  - `GET  /api/affiliates/me` — current affiliate dashboard data
  - `POST /api/affiliates/me/intros` — create manual intro
  - `GET  /api/affiliates/me/intros` — list referrals
  - `GET  /api/affiliates/me/commissions` — list commissions + totals
  - `GET  /api/admin/affiliates` — admin list by status
  - `POST /api/admin/affiliates/[id]/approve` — admin approve + send welcome
- ✅ Modified `/api/onboard/route.ts` — calls `resolveAttribution()` for all 3 user types after profile creation (best-effort, never blocks onboarding)
- ✅ Modified `/api/jobs/check-appeals/route.ts` — calls `recordCommissionForTransaction()` after Stripe transfer succeeds (best-effort, never blocks payouts)
- ✅ TypeScript compiles cleanly — `tsc --noEmit` exit 0

**Not yet shipped (next session):**
- ⏳ Frontend pages (8 pages: landing, apply, login flow, dashboard, manual intro form, admin)
- ⏳ Lower-priority API routes: `/logout`, `/me/payouts`, `/validate-code`, `/reject`, `/override-attribution`, `/cancel-commission`
- ⏳ Migration applied to actual Supabase project
- ⏳ Env vars set in Vercel (`AFFILIATE_SESSION_SECRET` is the only required one)

**Required env vars before deployment:**
- `AFFILIATE_SESSION_SECRET` — random 32-byte hex (REQUIRED — `assertConfigValid()` will throw at runtime if missing)
- `AFFILIATE_ADMIN_PHONE` — admin's WhatsApp number for new-application alerts (optional, but otherwise admin won't be notified)
- All other affiliate config env vars use sensible defaults — only override if you want a non-default value

**Deploy steps when ready:**
1. Apply migration to Supabase: `supabase db push --linked` or via Supabase Studio
2. Set `AFFILIATE_SESSION_SECRET` in Vercel (e.g., `openssl rand -hex 32`)
3. Set `AFFILIATE_ADMIN_PHONE` in Vercel (E.164 format, e.g., `+5491176345405`)
4. Deploy
5. Test the apply flow → check admin Whatsapp → approve via API → check applicant WhatsApp → magic-link login
