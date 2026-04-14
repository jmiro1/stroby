# Matching Engine — Build Plan (Layers 2 & 3)

## STATUS: ALL 3 LAYERS BUILT (2026-04-15)

- Layer 1 (Creator Intelligence): DONE (2026-04-14)
- Layer 2 (Brand Intelligence): DONE (2026-04-15)
- Layer 3 (Semantic Matching): DONE (2026-04-15)

### Remaining work:
- ~~Wire brand onboarding questions into WhatsApp flow~~ DONE (2026-04-15)
- ~~Auto-trigger brand analysis on brand signup~~ DONE (2026-04-15)
- ~~Auto-trigger re-matching when new intelligence arrives~~ DONE (2026-04-15)
- ~~Industry-aware value-per-subscriber model~~ DONE (2026-04-15)
- Uncomment OPENAI_API_KEY in .env.local for production-quality embeddings
- Dashboard view of matches in the Stroby app

---

Original plan below for reference:

---

## Layer 2: Brand Intelligence

**Goal:** Build deep profiles of brands/advertisers so the matching engine
understands WHO they want to reach, not just what industry they're in.

### What to build

1. **`brand_intelligence.py`** — in `/stroby/intelligence/`
   - Scrape brand websites (product page, about, blog, pricing, case studies)
   - Extract via Haiku:
     ```json
     {
       "product_category": "e.g. project management SaaS for remote teams",
       "target_customer": {
         "profession": "e.g. engineering managers, product leads",
         "company_size": "e.g. 50-500 employees",
         "seniority": "e.g. mid-senior",
         "pain_points": ["async collaboration", "sprint planning overhead"],
         "income_bracket": "$120k-$200k"
       },
       "brand_voice": "professional | playful | edgy | premium | technical",
       "past_sponsors": ["newsletters or channels they've sponsored before"],
       "competitors": ["competitor 1", "competitor 2"],
       "budget_signals": "bootstrapped | seed | series-a | enterprise",
       "content_themes_they_align_with": ["remote work", "engineering culture", "productivity"],
       "audience_they_want": "one-line description of their ideal reader"
     }
     ```
   - Store in Supabase `business_profiles.brand_intelligence` JSONB
   - Accumulate from multiple sources (website, onboarding answers, campaign history)

2. **Enhanced onboarding questions** — update WhatsApp onboarding flow
   - Add: "Describe the person who buys your product" (free text)
   - Add: "What newsletters have you sponsored before?" (competitor intel)
   - Add: "What's your monthly newsletter budget?" (budget tier)
   - These feed directly into brand_intelligence JSONB

3. **Competitive intelligence module** — `competitive_intel.py`
   - Track which newsletters competitors sponsor (from creator's sponsor_mentions)
   - Cross-reference: if Brand A's competitor sponsors Newsletter X,
     Newsletter X is likely a good match for Brand A
   - Data source: the `sponsor_mentions` field already extracted in Layer 1

### Schema: Brand Intelligence Profile

```json
{
  "website_analyses": [{date, extracted_data}, ...],
  "onboarding_data": {customer_description, past_sponsors, budget},
  "synthesized": {
    "ideal_audience": "senior PMs at B2B SaaS companies, $150k+",
    "content_affinity": ["product management", "engineering leadership", "remote work"],
    "brand_voice": "professional",
    "budget_tier": "series-a",
    "competitor_sponsors": {"competitor_name": ["newsletter_1", "newsletter_2"]},
    "one_line_need": "Reach senior PMs at mid-size SaaS companies who read about engineering leadership"
  },
  "last_analyzed_at": "..."
}
```

### Files to create/modify
- CREATE: `/stroby/intelligence/brand_intelligence.py`
- CREATE: `/stroby/intelligence/competitive_intel.py`
- MODIFY: `/stroby/intelligence/server.py` — add `/analyze-brand`, `/brand-stats` endpoints
- MODIFY: WhatsApp onboarding flow — add 3 new questions

---

## Layer 3: Semantic Matching

**Goal:** Match creators to brands using vector similarity on audience/need
profiles — NOT industry keywords.

### The key insight (from Joaquim)

> "A travel brand could be interesting for finance people that have disposable
> income and are subscribed to a best conferences newsletter... it's not
> industry-specific but audience/need-specific."

This means matching on:
- **Audience overlap**: Does the creator's audience match the brand's target customer?
- **Intent alignment**: Are readers in a buying/exploring mindset for what the brand sells?
- **Income/seniority fit**: Can the audience afford the product?
- **Content affinity**: Does the creator's content align with the brand's themes?

NOT matching on: "travel brand → travel newsletter" (too narrow).

### What to build

1. **`semantic_matching.py`** — in `/stroby/intelligence/`
   - Generate embeddings for Creator Intelligence Profiles (synthesized one-liner + top topics + audience profile)
   - Generate embeddings for Brand Intelligence Profiles (ideal audience + content affinity + one-line need)
   - Cosine similarity between creator and brand embeddings
   - Adjustments on top of raw similarity:
     - Audience size fit (brand budget vs. creator subscriber count)
     - Geographic overlap
     - Price tier match (premium brand → premium newsletter)
     - Advertiser friendliness score
     - Content consistency score (brands want consistent creators)

2. **Embedding approach**
   - Use OpenAI `text-embedding-3-small` (cheap, good quality, 1536 dims)
   - Or Voyage AI `voyage-3` if we want to stay Anthropic-adjacent
   - Store embeddings in Supabase with pgvector extension
   - Supabase already supports pgvector — just need to enable + create column

3. **Match scoring formula**
   ```
   match_score = (
     0.50 * cosine_similarity(creator_embedding, brand_embedding)  # audience/need alignment
   + 0.15 * audience_size_fit(creator_subs, brand_budget)           # can they afford this creator?
   + 0.10 * advertiser_friendliness / 10                            # brand-safe content
   + 0.10 * content_consistency                                     # reliable creator
   + 0.10 * income_bracket_match(creator_audience, brand_target)    # audience can afford product
   + 0.05 * competitor_signal(brand, creator)                       # competitor sponsors this creator
   )
   ```

4. **Match endpoints**
   - `GET /matches/brand/{brand_id}` → top 20 creator matches with scores + explanations
   - `GET /matches/creator/{creator_id}` → top 20 brand matches
   - Each match includes a human-readable explanation: "83% match — your audience of senior PMs at B2B SaaS companies aligns with Acme's target customer. Similar newsletters they sponsor: ProductLed Weekly."

5. **Feedback loop** (future)
   - When a placement happens, track performance (clicks, conversions)
   - Feed back into the matching weights
   - Creators who perform well for similar brands get boosted

### Files to create/modify
- CREATE: `/stroby/intelligence/semantic_matching.py`
- CREATE: `/stroby/intelligence/embeddings.py` — embedding generation + storage
- MODIFY: `/stroby/intelligence/server.py` — add match endpoints
- MODIFY: Supabase — enable pgvector, add embedding columns

---

## Build Order

### Session 1: Brand Intelligence (Layer 2)
1. `brand_intelligence.py` — website scraper + Haiku extraction
2. Brand Intelligence Profile schema in Supabase
3. Server endpoints (`/analyze-brand`, `/brand-stats`)
4. Test end-to-end with a real brand from business_profiles
5. `competitive_intel.py` — cross-reference sponsor_mentions

### Session 2: Semantic Matching (Layer 3)
1. Enable pgvector in Supabase
2. `embeddings.py` — generate + store embeddings for existing profiles
3. `semantic_matching.py` — cosine similarity + adjustment factors
4. Match endpoints with human-readable explanations
5. Test: run matches for a real brand, verify audience/need logic works

### Session 3: Integration
1. Wire brand onboarding questions into WhatsApp flow
2. Auto-trigger brand analysis on signup
3. Auto-trigger re-matching when new intelligence arrives
4. Dashboard view of matches (if time)

---

## Dependencies

- OpenAI API key OR Voyage AI key (for embeddings)
- Supabase pgvector extension enabled
- Existing Layer 1 data (creator intelligence profiles)
- At least a few business_profiles in Supabase to test against
