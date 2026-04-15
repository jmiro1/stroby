# Shadow Profiles — Architecture Plan

Make the product DB feel populated on day 1 by letting scraped brand & creator profiles live alongside real users, without letting them leak into analytics, billing, or direct customer-facing surfaces. The matching engine sees everyone; the rest of the app sees only real signed-up users.

This plan was written 2026-04-15 alongside the OpenClaw browser-automation scrapers (YC, Meta Ad Library, Paved, beehiiv Discover, Substack BFS) — the scrapers are what _produce_ shadow rows; this plan is what _receives_ them safely in the product DB.

---

## Why this exists

Current state:
- **`business_profiles`** holds real signed-up businesses only (single-digit count). Same for `newsletter_profiles`.
- **Matching engine** ranks creator↔brand fits via pgvector similarity + adjustment factors. With ~10 rows total, the ranking is trivial and real users get "no matches yet."
- **Leadgen sidecar** on the Hostinger VPS (`/opt/stroby-leadgen/`, SQLite) has ~7,700 discovered creator leads and can scrape ~3,000–8,000 brand leads in one day via OpenClaw browser agents (YC, Meta Ad Library, Paved, Shopify app reviews, Kickstarter). None of these are in the product DB.

The gap: we have the inventory, it just isn't where the matching engine can see it. Porting it over naively (just inserting scraped rows into `business_profiles`) would pollute every analytics query, every admin dashboard, every billing/escrow code path, every "how many brands are on Stroby?" message. It would also risk sending real creators introduction emails to brands that never signed up.

Shadow profiles solve this by keeping scraped rows in the product DB but **invisible** to the app, with a well-defined promotion path when a brand actually claims their profile.

---

## The architecture (one DB, two views)

```
                           ┌──────────────────────────────────────────────┐
                           │         Supabase project: stroby-mvp          │
                           │                                               │
                           │   ┌───────────────────────────────────────┐  │
  Leadgen scrapers ───────▶│   │  business_profiles_all  (BASE TABLE)  │  │
  (VPS, sidecar)           │   │  ─────────────────────────────────     │  │
  shadow inserts           │   │  id, company_name, website, ...       │  │
  only, service_role       │   │  onboarding_status:                   │  │
                           │   │    'shadow'           (scraped)       │  │
                           │   │    'whatsapp_active'  (real user)     │  │
                           │   │    'paused' | 'suspended' | ...       │  │
                           │   │  shadow_source: 'yc-w25'|'meta-adlib' │  │
                           │   │  claimed_at: timestamptz | null       │  │
                           │   │  brand_intelligence: jsonb            │  │
                           │   │  profile_embedding: vector(1536)      │  │
                           │   │                                       │  │
                           │   │  RLS: anon/auth  → hide shadow rows   │  │
                           │   │       service_role → full access      │  │
                           │   └──────┬─────────────────────────┬──────┘  │
                           │          │                         │         │
                           │          ▼                         ▼         │
                           │   ┌─────────────┐        ┌──────────────────┐│
                           │   │ VIEW        │        │ VIEW             ││
                           │   │ business_   │        │ business_        ││
                           │   │ profiles    │        │ directory        ││
                           │   │ (REAL only) │        │ (REAL + SHADOW)  ││
                           │   │ status !=   │        │ no filter        ││
                           │   │  'shadow'   │        │                  ││
                           │   │ WITH CHECK  │        │ (read-only for   ││
                           │   │  OPTION     │        │  matching only)  ││
                           │   └──────┬──────┘        └────────┬─────────┘│
                           └──────────┼───────────────────────┼───────────┘
                                      │                       │
          ┌───────────────────────────┘                       │
          ▼                                                   ▼
  ┌──────────────────┐                            ┌─────────────────────┐
  │ Production app   │                            │ Matching engine     │
  │ (Next.js/Vercel) │                            │ (src/lib/intel/*)   │
  │ ──────────────   │                            │ ───────────────     │
  │ Onboarding       │                            │ Brand↔creator rank  │
  │ WhatsApp agent   │                            │ Vector similarity   │
  │ Chat widget      │                            │ Batch match jobs    │
  │ Dashboards       │                            │                     │
  │ Billing / Stripe │                            │ SEES SHADOWS        │
  │ Escrow           │                            │ (reads directory)   │
  │ /welcome/[id]    │                            │                     │
  │                  │                            │ Before proposing    │
  │ NEVER SEES       │                            │ a shadow brand to a │
  │ SHADOWS          │                            │ real creator:       │
  │ (reads profiles  │                            │   1. Fire claim-    │
  │  view only)      │                            │      flow outreach  │
  │                  │                            │   2. Park match in  │
  │ Writes real rows │                            │      'pending'      │
  │ via profiles OR  │                            │      until claim or │
  │ _all (for status │                            │      7-day expiry   │
  │ transitions)     │                            │                     │
  └──────────────────┘                            └─────────────────────┘
```

Same pattern applies to `newsletter_profiles_all` → `newsletter_profiles` view + `newsletter_directory` view, and (if we keep it) `other_profiles_all` → `other_profiles` view + `other_directory` view.

---

## Why not two physical databases

The "two physical DBs" alternative (one for real users, one for real + shadow) looks cleaner on paper but is strictly worse for this use case.

| Concern | One DB + two views (recommended) | Two physical DBs |
|---|---|---|
| Vector similarity across real + shadow in a single query | ✅ native pgvector `<=>` on one index | ❌ either federate via `postgres_fdw` (complex) or merge in app code (ranking becomes apples-to-oranges across two indexes) |
| Claim atomicity (shadow → real) | ✅ single `UPDATE` in one transaction | ❌ cross-DB transaction, or optimistic dual-write with drift risk |
| Profile updates (real user edits their pitch) | ✅ trivial | ❌ must replicate to shadow mirror, lag + conflict resolution |
| Analytics safety ("only real users") | ✅ view enforces it; RLS double-locks | ✅ physically impossible to query shadows |
| Accidental shadow leak to client | ✅ blocked by view + RLS + `WITH CHECK OPTION` | ✅ physically impossible |
| Ops surface | 1 project, 1 backup, 1 connection pool, 1 secret | 2 projects, 2 backups, 2 connection pools, 2 secrets |
| Schema drift risk | None | Migrations must run against both |
| Embedding storage cost | 1× | 2× for any row that exists in both |

The only real win of physical separation is "shadow DB compromise can't leak real users." That's low-probability, low-severity — same entity, same credentials root. Views + RLS get you ~99% of that isolation at ~10% of the ops cost.

---

## Safety rules (non-negotiable)

1. **Row-Level Security on the base table.** `anon` and `authenticated` roles can only `SELECT` rows where `onboarding_status != 'shadow'`. `service_role` (used by matching engine + leadgen ingestion + admin) bypasses RLS as normal. This is the hard lock.

2. **`WITH CHECK OPTION` on the `business_profiles` view.** Inserts/updates through the view that would produce a shadow row are _rejected with an error_, not silently dropped. Prevents app code from ever accidentally writing a shadow.

3. **Two write paths, two credentials.**
   - **App code** writes real rows via `business_profiles` (the view). Client uses Supabase anon/auth keys. `onboarding_status='shadow'` inserts through this path fail loudly because of `WITH CHECK OPTION`.
   - **Leadgen ingestion** (VPS) writes shadow rows directly to `business_profiles_all`, using service-role key. One dedicated code path in the app (`/api/shadow/ingest`), service-role-only.

4. **Matching engine is read-only against `business_directory`.** It never writes. Status transitions (shadow → claimed, or shadow → purged) happen through dedicated endpoints that run the promotion in a single transaction.

5. **Two new columns, never mutable by clients.** `shadow_source` and `claimed_at` are set only by ingestion and claim-flow code paths. App client never touches them directly.

6. **No shadow profile is ever shown to a real user _as_ a shadow.** Creators proposed a shadow brand see a normal match card. The "is this brand signed up yet?" distinction is handled server-side (by gating the introduction email behind claim) and is invisible in the UI. Otherwise creators second-guess shadow matches and the whole density benefit collapses.

---

## Schema migration

Small, additive, reversible. Runs through Supabase CLI migrations so it's versioned.

```sql
-- ======================================================================
-- Migration: shadow profiles
-- Date: 2026-04-15 (draft — not yet run)
-- ======================================================================

-- 1. New columns on the existing tables (additive, backfills to NULL)
ALTER TABLE business_profiles
  ADD COLUMN shadow_source text,
  ADD COLUMN claimed_at    timestamptz;

ALTER TABLE newsletter_profiles
  ADD COLUMN shadow_source text,
  ADD COLUMN claimed_at    timestamptz;

-- 2. Rename the physical tables. The NAMES `business_profiles` and
--    `newsletter_profiles` will become VIEWS in step 3, so existing
--    app queries continue to work unchanged.
ALTER TABLE business_profiles   RENAME TO business_profiles_all;
ALTER TABLE newsletter_profiles RENAME TO newsletter_profiles_all;

-- 3. Views
CREATE VIEW business_profiles AS
  SELECT * FROM business_profiles_all
  WHERE onboarding_status != 'shadow'
  WITH CHECK OPTION;

CREATE VIEW newsletter_profiles AS
  SELECT * FROM newsletter_profiles_all
  WHERE onboarding_status != 'shadow'
  WITH CHECK OPTION;

CREATE VIEW business_directory AS
  SELECT * FROM business_profiles_all;

CREATE VIEW newsletter_directory AS
  SELECT * FROM newsletter_profiles_all;

-- 4. RLS on the base tables
ALTER TABLE business_profiles_all   ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_profiles_all ENABLE ROW LEVEL SECURITY;

CREATE POLICY hide_shadow_from_clients_b ON business_profiles_all
  FOR SELECT TO authenticated, anon
  USING (onboarding_status != 'shadow');

CREATE POLICY hide_shadow_from_clients_n ON newsletter_profiles_all
  FOR SELECT TO authenticated, anon
  USING (onboarding_status != 'shadow');

-- service_role bypasses RLS by default in Supabase, so matching engine
-- + leadgen ingestion keep working.

-- 5. Shadow-lookup indexes (small + useful at claim-flow time)
CREATE INDEX business_profiles_all_shadow_idx
  ON business_profiles_all(onboarding_status)
  WHERE onboarding_status = 'shadow';

CREATE INDEX newsletter_profiles_all_shadow_idx
  ON newsletter_profiles_all(onboarding_status)
  WHERE onboarding_status = 'shadow';

-- 6. Optional — expire old unclaimed shadows (run via cron later)
--    Schema doesn't need a change; the job queries:
--    DELETE FROM business_profiles_all
--      WHERE onboarding_status = 'shadow'
--      AND created_at < now() - interval '180 days'
--      AND NOT EXISTS (SELECT 1 FROM introductions WHERE
--                      business_id = business_profiles_all.id);
```

All existing app queries continue to work because `business_profiles` is still selectable; it's just a view now. No code change required for app read paths.

**App write paths:** Supabase's auto-updatable views accept inserts/updates that satisfy the view predicate; `WITH CHECK OPTION` enforces that any write through the view has `onboarding_status != 'shadow'`. So the onboarding/chat agent code can keep writing via `.from('business_profiles')` — it just can't ever produce a shadow by accident.

**Matching engine write paths:** none. It reads `business_directory` and `newsletter_directory`, writes are only to `introductions` and its own scoring artifacts. Unchanged.

---

## Claim flow (state machine)

```
   ┌──────────────┐        claim link clicked        ┌────────────────┐
   │   shadow     │ ──────────────────────────────▶ │ claim_pending  │
   │ (scraped)    │                                  │ (form shown)   │
   └──────┬───────┘                                  └────────┬───────┘
          │                                                   │
          │ 180 days unused                    confirm        │
          │ AND no proposed introductions      + whatsapp     │
          │                                    opt-in         │
          │                                                   ▼
   ┌──────▼──────┐   merge claimed details     ┌────────────────────┐
   │   purged    │ ◀─── never shown ────────── │ whatsapp_active    │
   └─────────────┘                              │ (real user)        │
                                                │ claimed_at = now() │
                                                └────────────────────┘
```

The claim link looks like `https://stroby.ai/claim/<token>` where `<token>` is an HMAC-signed blob carrying `{profile_id, profile_type, expires_at}`. Signed with `CLAIM_TOKEN_SECRET` (new env var). On click:

1. Server validates token signature + expiry.
2. Loads the shadow row; if already claimed, redirect to `/welcome/[id]` (they've claimed before).
3. Renders an abbreviated onboarding form, pre-filled with the scraped data (`company_name, website, brand_intelligence` summary) plus editable fields.
4. User confirms + adds WhatsApp number + (optional) email.
5. Server runs in a single transaction:
   ```sql
   UPDATE business_profiles_all
     SET onboarding_status = 'whatsapp_active',
         claimed_at = now(),
         phone = $1,
         email = $2,
         -- any edits from the claim form
         ...
     WHERE id = $3
       AND onboarding_status = 'shadow';
   ```
   Conditional on `onboarding_status = 'shadow'` so simultaneous claims can't double-promote.
6. Triggers the normal welcome WhatsApp template.

If a shadow row is never claimed: harmless, just consumes DB bytes. The 180-day purge keeps it bounded.

If a real user tries to sign up via regular onboarding and we'd have scraped their company separately: the onboarding code checks `business_directory` for same-website/same-company matches before inserting a new row; on match, it fires the claim flow instead of creating a duplicate. (This is an important detail — without it we'd have two rows for the same brand, one shadow + one real.)

---

## Where the leadgen sidecar still fits

The VPS SQLite DB (`/opt/stroby-leadgen/data/leads.db`) is NOT going away. It stays as the **pre-enrichment** tier:

```
  Scrape → brand_leads (SQLite, VPS)  ← raw rows, may lack website data
               │
               ▼
  Brand Intelligence runs
  (src/lib/intelligence/brand.ts)
               │
               ├── success + confident → POST /api/shadow/ingest
               │                         (service-role, VPS → Vercel)
               │                                │
               │                                ▼
               │                    business_profiles_all
               │                    onboarding_status='shadow'
               │                    shadow_source='<scraper>'
               │                    brand_intelligence populated
               │                    profile_embedding generated
               │
               └── enrichment fail  → stays in sidecar, retry tomorrow
                                      eventually dropped after N tries
```

This keeps the existing firewall's SPIRIT intact:
- Discovery + scraping + low-confidence enrichment: sidecar only
- Product DB sees rows only after they have a real intelligence profile and embedding

A row's graduation from sidecar → product DB is explicit and goes through one code path. If that code path has a bug, sidecar is quarantine; no pollution of product data.

The sidecar's `lead_pubs` table (creators) graduates to `newsletter_profiles_all` only after we've captured 2–3 newsletter issues for Content Intelligence (usually requires auto-subscribing via Echo and waiting 1–2 weeks for issues to arrive). Brands graduate faster because Brand Intelligence works from just the website.

---

## Matching engine changes

Two files change (`src/lib/intelligence/matching.ts` + the job that invokes it in `src/app/api/jobs/*`). Specifically:

1. Swap `.from('business_profiles')` → `.from('business_directory')` and `.from('newsletter_profiles')` → `.from('newsletter_directory')` in the ranking queries.
2. Add `counterparty_status` to match output (`'shadow'` or `'whatsapp_active'`).
3. Introduction-proposal code checks `counterparty_status`:
   - If both sides are `whatsapp_active` → normal double-opt-in flow.
   - If one side is `shadow` → fire claim-flow outreach (cold email via Smartlead, personalized with the match data), park the `introduction` row as `status='awaiting_claim'`, return to the real user with "we've reached out to the brand; we'll notify you when they activate" (or don't show them the match at all — see Decision #3 below).
4. Awaiting-claim introductions expire after 7 days if no claim. Creator never knows; it's an internal bookkeeping state.

---

## Tradeoffs

| You get | You give up |
|---|---|
| Matching works against 3k–8k profiles from day 1 | "Product DB = real customers only" is no longer literally true; it's "product DB = real + shadows, but clients only see real" |
| Claim-flow cold emails can show "12 matches waiting" (real numbers, real creators) | One more state (`shadow`) to reason about in every matching-related code path |
| Analytics queries hit `business_profiles` → naturally exclude shadows | Need discipline: matching engine queries MUST use `business_directory`; everything else MUST use the filtered view |
| Zero replication, zero cross-DB joins, zero ops overhead | RLS must be correct on day 1; test carefully before enabling scrapers |
| Atomic shadow → real promotion, race-safe | Legal/privacy posture shifts — the privacy policy needs an opt-out pathway for scraped shadows, and scraping sources must be documented |
| Real signup flow auto-claims any matching shadow (no duplicates) | Onboarding code must check `business_directory` for website/email collisions before creating a new row |

---

## Build plan

Ordered, roughly one working day end-to-end.

### Phase 1 — schema + plumbing (~2 hours)

- [ ] Run the migration SQL above via Supabase CLI (`supabase migration new shadow_profiles`, paste SQL, `supabase db push`).
- [ ] Verify RLS: from a second Supabase client using the anon key, `SELECT count(*) FROM business_profiles_all WHERE onboarding_status = 'shadow'` should return 0 even after a shadow is inserted via service-role. If it returns > 0, RLS is misconfigured — halt.
- [ ] Verify `WITH CHECK OPTION`: from anon key, `INSERT INTO business_profiles (..., onboarding_status) VALUES (..., 'shadow')` should error. If it succeeds, view is misconfigured — halt.
- [ ] Add `shadowSource`, `claimedAt` to the TypeScript type definitions in `src/types/database.ts` (or wherever).

### Phase 2 — ingestion endpoint (~1 hour)

- [ ] `POST /api/shadow/ingest` — service-role Bearer auth via `INGEST_SECRET`, JSON body shape:
  ```typescript
  {
    type: 'brand' | 'creator',
    source: 'yc-w25' | 'meta-adlib' | 'paved' | 'beehiiv-discover' | ...,
    data: {
      company_name?: string,       // brand
      website_url?: string,        // brand
      newsletter_name?: string,    // creator
      url?: string,                // creator
      niche?: string,
      brand_intelligence?: object, // optional, run inline if missing
      ...
    }
  }
  ```
- [ ] Handler: validate, run Brand Intelligence if not provided (reuses `src/lib/intelligence/brand.ts`), generate embedding, insert into `business_profiles_all` or `newsletter_profiles_all` with `onboarding_status='shadow'`.
- [ ] Collision check: if website already exists as `whatsapp_active`, skip (don't downgrade). If exists as `shadow`, upsert intelligence (re-scrape might have better data).

### Phase 3 — claim flow (~2 hours)

- [ ] `src/lib/shadow/tokens.ts` — `signClaimToken(profileId, profileType)` + `verifyClaimToken(token)` using HMAC-SHA256 with `CLAIM_TOKEN_SECRET`.
- [ ] `/claim/[token]` page — token validation, loads shadow row, renders abbreviated onboarding form (WhatsApp-first UX; email optional).
- [ ] `POST /api/shadow/claim` — runs the transactional UPDATE above, fires welcome WhatsApp template.
- [ ] Handle the "already claimed" case gracefully (redirect to `/welcome/[id]`).

### Phase 4 — matching + onboarding integration (~1.5 hours)

- [ ] `src/lib/intelligence/matching.ts` — swap to `business_directory`, `newsletter_directory`, add `counterparty_status` to output type.
- [ ] `src/app/api/jobs/*` matching job — branch on `counterparty_status`: if shadow, enqueue claim-flow outreach (stub function for now) and park introduction with `status='awaiting_claim'`.
- [ ] Onboarding flow (`src/lib/whatsapp-onboarding.ts` + `createProfileFromOnboarding`) — before insert, query `business_directory`/`newsletter_directory` for website/email collision; if shadow match, issue a claim token internally and complete the onboarding as a claim instead of a new insert.

### Phase 5 — outreach for shadow claims (~1 hour, stub for now)

- [ ] `src/lib/shadow/outreach.ts` — `sendClaimEmail(profileId, matchData)` — integrates with Smartlead (or just console.logs for v1, promoted later when brand cold-email infra is ready).
- [ ] For v1, we can manually review `introductions WHERE status='awaiting_claim'` and send claim emails by hand. Automate in v2.

### Phase 6 — legal + admin (~30 min)

- [ ] Privacy policy addendum: "Stroby maintains a pre-launch directory of companies publicly identifying as newsletter-marketing-relevant. If you do not want to be listed, email privacy@stroby.ai and we'll remove your profile within 72 hours."
- [ ] Admin dashboard: add `?include_shadows=1` query param on key pages (growth, brand-count, creator-count). Default = false. Admin can flip to see the full directory.

### Phase 7 — expiry job (later, non-blocking)

- [ ] Cron `/api/jobs/purge-expired-shadows` — `DELETE FROM business_profiles_all WHERE onboarding_status = 'shadow' AND created_at < now() - interval '180 days' AND NOT EXISTS (SELECT 1 FROM introductions WHERE business_id = business_profiles_all.id)`. Mirror for creators.
- [ ] Same `vercel.json` cron slot constraints apply (Hobby = 1 daily cron); can piggyback on the existing 8am UTC matching job since they don't conflict.

---

## Decisions needed before building

1. **Go/no-go.** Accept the "product DB is no longer literally real-users-only" tradeoff?

2. **Scope.** Shadow profiles for brands only, or brands + creators? Brands-only is a cleaner v1 because creators need Content Intelligence which needs issue samples (1–2 week delay via Echo). Brands can ingest from a single website scrape.

3. **Visibility to real users.** Two sub-options for how a shadow shows up in the matching UI:
   - **(a) Identical to a real match** — creator sees a brand card normally; server gates the introduction behind claim. _Recommended._ Maximizes density benefit.
   - **(b) Labeled "Pre-launch — we'll reach out on your behalf"** — more honest, but creators will under-value these matches and the whole density benefit weakens. Only pick this if legal pressure requires it.

4. **Claim channel.** Cold email via Smartlead is the default. Alternatives: WhatsApp (only if we have their number, rare for shadows), LinkedIn DM (high effort, high conversion).

5. **Ingest secret.** Add `INGEST_SECRET` (service-role-equivalent) as a Vercel env var. VPS uses it to auth to `/api/shadow/ingest`. Separate from `SUPABASE_SERVICE_ROLE_KEY` so we can rotate independently.

6. **Claim token secret.** Add `CLAIM_TOKEN_SECRET` (random 32-byte hex). Used to sign claim URLs. Rotating invalidates pending claim links; acceptable given the 7–30 day expiry.

---

## Appendix: code sketches

### `/api/shadow/ingest` handler sketch

```typescript
// src/app/api/shadow/ingest/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { analyzeBrandWebsite } from '@/lib/intelligence/brand';
import { generateEmbedding } from '@/lib/intelligence/embeddings';
import { timingSafeEqual } from 'crypto';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer /, '');
  const expected = process.env.INGEST_SECRET!;
  const ok = token.length === expected.length &&
             timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json();
  const { type, source, data } = body;

  const supabase = createServiceClient();
  const table = type === 'brand' ? 'business_profiles_all' : 'newsletter_profiles_all';
  const dirView = type === 'brand' ? 'business_directory' : 'newsletter_directory';

  // Collision check
  const collisionKey = type === 'brand' ? 'website_url' : 'url';
  const collisionValue = data[collisionKey];
  if (collisionValue) {
    const { data: existing } = await supabase
      .from(dirView)
      .select('id, onboarding_status')
      .eq(collisionKey, collisionValue)
      .maybeSingle();
    if (existing && existing.onboarding_status === 'whatsapp_active') {
      return NextResponse.json({ skipped: 'already_real', id: existing.id });
    }
    // if shadow: upsert intelligence below
  }

  // Intelligence
  let intel = data.brand_intelligence || data.content_intelligence;
  if (!intel && type === 'brand' && data.website_url) {
    intel = await analyzeBrandWebsite(data.website_url);
  }
  const embeddingText = buildFingerprint(type, data, intel);
  const embedding = await generateEmbedding(embeddingText);

  const { data: row, error } = await supabase
    .from(table)
    .upsert({
      ...normalizeForTable(type, data),
      onboarding_status: 'shadow',
      shadow_source: source,
      ...(type === 'brand'
        ? { brand_intelligence: intel, profile_embedding: embedding }
        : { content_intelligence: intel, profile_embedding: embedding }),
    }, { onConflict: collisionKey })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: row.id, ok: true });
}
```

### `/api/shadow/claim` handler sketch

```typescript
// src/app/api/shadow/claim/route.ts
export async function POST(req: NextRequest) {
  const { token, formData } = await req.json();
  const { profileId, profileType } = verifyClaimToken(token);
  const supabase = createServiceClient();
  const table = profileType === 'brand' ? 'business_profiles_all' : 'newsletter_profiles_all';

  const { data, error } = await supabase
    .from(table)
    .update({
      onboarding_status: 'whatsapp_active',
      claimed_at: new Date().toISOString(),
      phone: formData.phone,
      email: formData.email ?? null,
      // ...any edited fields
    })
    .eq('id', profileId)
    .eq('onboarding_status', 'shadow')  // race-safe
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'already_claimed' }, { status: 409 });

  // Fire welcome WhatsApp template
  await sendWelcomeTemplate(profileId, profileType, formData.phone);

  return NextResponse.json({ id: profileId, ok: true });
}
```

---

## Open questions / future work

- **Multi-source attribution.** If a brand is scraped from YC *and* Meta Ad Library, which `shadow_source` wins? Probably a `text[]` column instead of a scalar, but v1 can live with last-write-wins.
- **Shadow → shadow merges.** If two scrapers produce two shadow rows for the same website before the collision check catches it (race), we need a dedupe job. Low priority — run manually after a big scrape.
- **Content Intelligence for creator shadows.** Requires at least 2–3 issue samples. The Echo pipeline already does this for claimed creators; for shadows, either we subscribe proactively to every shadow (cost: more inbound email volume + rate-limit risk on one Gmail account) or we defer creator shadows until a real brand-match request needs them (lazy enrichment).
- **Purge policy edge cases.** If a shadow row has been used to produce an introduction (even awaiting_claim), it shouldn't purge — keep for audit. Already covered by the `NOT EXISTS (SELECT 1 FROM introductions...)` clause.
- **Observability.** A tiny `shadow_events` table recording `ingested_at`, `claimed_at`, `shown_in_match_at`, `purged_at` per profile gives us funnel metrics (how many shadows → proposed in a match → claimed). Skip for v1, add when volume justifies.
- **Rate-limit handling on ingest.** A single scraper batch can ingest 2000+ rows, each triggering a Haiku call for Brand Intelligence. Need queueing so we don't hammer the Anthropic API or Vercel's per-request timeout. Probably Vercel background functions or a lightweight job queue in Supabase.

---

## Related docs

- `AFFILIATE_PRD.md` — affiliate program spec (unrelated but similar shape of "extra layer on top of the product DB").
- `leadgen/openclaw-todo.md` — the browser-automation scraping plan that produces shadow rows.
- `leadgen/plans/01_echo_implementation_plan.md` — Echo pipeline, which is how creator shadows get their Content Intelligence once we roll that tier out.
