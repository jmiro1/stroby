/**
 * Semantic Matching — Layer 3.
 * Cosine similarity on embeddings + industry-aware adjustment factors.
 */

import { createServiceClient } from "@/lib/supabase";

// ── Industry-aware value tiers ──

const VALUE_TIERS: Record<string, {
  budget_ranges: Record<string, [number, number]>;
  keywords: string[];
}> = {
  ultra_high_ticket: {
    budget_ranges: {
      "<500": [200, 5_000], "500-1000": [500, 10_000], "1000-2500": [1_000, 25_000],
      "2500-5000": [2_000, 50_000], "5000+": [5_000, 100_000],
    },
    keywords: ["enterprise", "wealth management", "private equity", "venture capital",
      "commercial real estate", "M&A", "executive", "C-suite", "fortune 500",
      "institutional", "family office", "hedge fund", "investment banking", "consulting", "advisory"],
  },
  high_ticket: {
    budget_ranges: {
      "<500": [500, 10_000], "500-1000": [1_000, 20_000], "1000-2500": [2_000, 50_000],
      "2500-5000": [5_000, 100_000], "5000+": [10_000, 200_000],
    },
    keywords: ["SaaS", "B2B", "premium", "luxury", "high-end", "professional services",
      "fintech", "legal tech", "medical device", "industrial equipment", "thermal",
      "inspection", "manufacturing", "enterprise software", "cybersecurity", "compliance", "analytics platform"],
  },
  mid_ticket: {
    budget_ranges: {
      "<500": [2_000, 20_000], "500-1000": [5_000, 40_000], "1000-2500": [8_000, 75_000],
      "2500-5000": [15_000, 150_000], "5000+": [30_000, 300_000],
    },
    keywords: ["course", "coaching", "education", "supplements", "fitness",
      "DTC", "direct-to-consumer", "subscription", "productivity tool",
      "design tool", "developer tool", "freelancer", "creator economy"],
  },
  volume_play: {
    budget_ranges: {
      "<500": [5_000, 50_000], "500-1000": [10_000, 75_000], "1000-2500": [25_000, 150_000],
      "2500-5000": [50_000, 300_000], "5000+": [100_000, 500_000],
    },
    keywords: ["consumer", "app", "mobile", "game", "fashion", "beauty",
      "food", "beverage", "CPG", "entertainment", "media", "news", "lifestyle", "shopping", "marketplace"],
  },
};

const DEFAULT_RANGES: Record<string, [number, number]> = {
  "<500": [1_000, 15_000], "500-1000": [3_000, 30_000], "1000-2500": [8_000, 75_000],
  "2500-5000": [20_000, 150_000], "5000+": [50_000, 500_000],
};

const INCOME_MAP: Record<string, number> = {
  "$30k-$60k": 45000, "$40k-$80k": 60000, "$50k-$80k": 65000, "$60k-$120k": 90000,
  "$80k-$150k": 115000, "$100k-$200k": 150000, "$120k-$200k": 160000,
  "$120k-$250k": 185000, "$150k+": 200000, "$200k+": 250000,
};

function classifyValueTier(brandIntel: Record<string, unknown>): string {
  const synth = normalizeBrandSynth(brandIntel);
  if (!Object.keys(synth).length) return "mid_ticket";

  const signals = [
    synth.product_category, synth.ideal_audience, synth.budget_signal,
    synth.one_line_need, synth.newsletter_fit,
    ...(synth.content_affinity as string[] || []),
    (synth.target_profile as Record<string, unknown>)?.psychographic,
    (synth.target_profile as Record<string, unknown>)?.company_size,
  ].filter(Boolean).join(" ").toLowerCase();

  let bestTier = "mid_ticket";
  let bestScore = 0;

  for (const [tierName, tierData] of Object.entries(VALUE_TIERS)) {
    let score = tierData.keywords.filter(kw => signals.includes(kw)).length;
    const budgetSig = ((synth.budget_signal as string) || "").toLowerCase();
    if (tierName === "ultra_high_ticket" && ["enterprise", "growth"].includes(budgetSig)) score += 3;
    if (tierName === "high_ticket" && ["series-a-b", "growth"].includes(budgetSig)) score += 2;

    const income = ((synth.target_profile as Record<string, unknown>)?.income_bracket as string) || "";
    if (["$150k+", "$200k+"].includes(income) && ["ultra_high_ticket", "high_ticket"].includes(tierName)) score += 2;

    if (score > bestScore) { bestScore = score; bestTier = tierName; }
  }

  return bestTier;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function audienceSizeFit(subs: number, budget: string, brandIntel: Record<string, unknown>): number {
  if (!subs || !budget) return 0.5;
  const tier = classifyValueTier(brandIntel);
  const ranges = VALUE_TIERS[tier]?.budget_ranges || DEFAULT_RANGES;
  const [min, max] = ranges[budget] || [5000, 100000];

  if (subs >= min && subs <= max) return 1.0;
  if (subs < min) return Math.max(subs / min, 0.1);
  return Math.max(max / subs, 0.3);
}

function incomeMatch(creatorIncome: string, brandIncome: string): number {
  const cVal = INCOME_MAP[creatorIncome] || 0;
  const bVal = INCOME_MAP[brandIncome] || 0;
  if (!cVal || !bVal) return 0.5;
  const ratio = Math.min(cVal, bVal) / Math.max(cVal, bVal);
  if (ratio >= 0.7) return 1.0;
  if (ratio >= 0.4) return 0.6;
  return 0.2;
}

function outcomeFit(
  creatorSynth: Record<string, unknown>,
  creator: Record<string, unknown>,
  brandOutcome: string | null
): number {
  if (!brandOutcome) return 0.5; // neutral for brands that haven't stated a preference

  const reach = (creator.audience_reach as number) || (creator.subscriber_count as number) || 0;
  const engRate = (creator.engagement_rate as number) || 0;
  const af = (creatorSynth.advertiser_friendliness as number) ?? 5;
  const consistency = (creatorSynth.content_consistency as number) ?? 0.5;

  switch (brandOutcome) {
    case "reach":
      // Bigger audience = better for reach goals
      return Math.min(reach / 100_000, 1.0);
    case "engagement":
      // High engagement rate = better for engagement goals
      if (engRate >= 0.05) return 1.0;
      if (engRate >= 0.03) return 0.8;
      if (engRate >= 0.01) return 0.5;
      return 0.3;
    case "conversions":
      // Proxy: engagement rate (click behavior) + advertiser-friendliness (commercial content)
      const engScore = engRate >= 0.05 ? 1.0 : engRate >= 0.03 ? 0.8 : engRate >= 0.01 ? 0.5 : 0.3;
      return (engScore + Math.min(af / 10, 1.0)) / 2;
    case "credibility":
      // Trusted voice: high advertiser-friendliness + consistent content
      return (Math.min(af / 10, 1.0) + consistency) / 2;
    default:
      return 0.5;
  }
}

function applySizePreference(
  sizeFit: number,
  reach: number,
  sizePreference: string | null
): number {
  if (!sizePreference || sizePreference === "any") return sizeFit;
  const penalty = 0.7;
  switch (sizePreference) {
    case "micro": return reach > 15_000 ? sizeFit * penalty : sizeFit;
    case "mid": return (reach < 8_000 || reach > 120_000) ? sizeFit * penalty : sizeFit;
    case "macro": return reach < 80_000 ? sizeFit * penalty : sizeFit;
    default: return sizeFit;
  }
}

// ── Engagement-rate scoring (now a top-level factor) ──
// Open rate / CTR is the single best proxy for "is this audience actually
// reading?" A 100K-sub newsletter with 1% open rate is worse than a
// 30K-sub at 50%. Previously this only fed outcomeFit when the brand's
// goal was "engagement"; promoting it surfaces it for every match.
function engagementScore(creator: Record<string, unknown>): number | null {
  const er = (creator.engagement_rate as number) || 0;
  if (er <= 0) return null; // unknown — caller will skip this factor
  if (er >= 0.30) return 1.0;       // exceptional (>30% open)
  if (er >= 0.15) return 0.85;      // strong
  if (er >= 0.05) return 0.65;      // healthy
  if (er >= 0.02) return 0.4;       // mediocre
  if (er >= 0.005) return 0.15;     // weak
  return 0.0;                        // dead audience
}

// ── Price fit ──
// Newsletter creators expose price_per_placement (USD). Brand exposes
// budget_range (e.g., "1000-2500"). Hard-filter when price >2× max budget.
// Otherwise score ratio with a sweet-spot at 0.5×–1.0× of max.
function priceFit(creatorPrice: number | null, budgetRange: string | null): { score: number | null; hardFail: boolean } {
  if (!creatorPrice || !budgetRange) return { score: null, hardFail: false };

  // Parse budget range (e.g. "1000-2500" → [1000, 2500]; "5000+" → [5000, 5000])
  const m = budgetRange.match(/^(\d+)(?:-(\d+))?(\+)?$/);
  if (!m) return { score: null, hardFail: false };
  const min = parseInt(m[1], 10);
  const max = m[2] ? parseInt(m[2], 10) : (m[3] ? min : min);

  if (creatorPrice > max * 2) return { score: 0, hardFail: true };
  if (creatorPrice >= min * 0.5 && creatorPrice <= max) return { score: 1.0, hardFail: false };
  if (creatorPrice <= max * 1.5) return { score: 0.7, hardFail: false };
  if (creatorPrice <= max * 2) return { score: 0.4, hardFail: false };
  return { score: 0.1, hardFail: false };
}

// ── Competitor overlap penalty ──
// If creator's known past sponsors include any of brand's listed
// competitors, dampen score 0.4× — strong negative signal that this
// creator's audience is already saturated with the competitor's pitch
// (or that the creator has loyalty conflicts).
function competitorOverlapMultiplier(
  brandSynth: Record<string, unknown>,
  creatorSynth: Record<string, unknown>
): { mult: number; matched: string[] } {
  const competitors = ((brandSynth.competitors as string[]) || []).map(c => c.toLowerCase().trim()).filter(Boolean);
  if (!competitors.length) return { mult: 1.0, matched: [] };
  const raw = (creatorSynth as Record<string, unknown>)._raw as Record<string, unknown> | undefined;
  const rawProfile = (creatorSynth as Record<string, unknown>).raw_profile as Record<string, unknown> | undefined;
  const commercial = (rawProfile?.commercial_signals as Record<string, unknown>) || (raw?.commercial_signals as Record<string, unknown>) || {};
  const pastSponsors = ((commercial.mentioned_past_sponsors as string[]) || []).map(s => s.toLowerCase().trim());
  if (!pastSponsors.length) return { mult: 1.0, matched: [] };
  const matched = competitors.filter(c => pastSponsors.some(p => p.includes(c) || c.includes(p)));
  if (matched.length === 0) return { mult: 1.0, matched: [] };
  return { mult: 0.4, matched };
}

// ── Vibe / tonal mismatch ──
// Brand voice and creator vibe should align. Compatibility matrix
// surfaces the strong dampeners; everything else is 1.0 (neutral).
const VIBE_BRAND_INCOMPATIBILITY: Record<string, Record<string, number>> = {
  premium:    { opinion_takes: 0.7, personal_essays_reflection: 0.85, community_building: 0.85 },
  professional: { opinion_takes: 0.8, narrative_storytelling: 0.85 },
  technical:  { narrative_storytelling: 0.8, personal_essays_reflection: 0.85 },
  minimalist: { opinion_takes: 0.85, narrative_storytelling: 0.9 },
  // playful / edgy brands tolerate most vibes; no entries means neutral
};

function vibeMismatchMultiplier(
  brandSynth: Record<string, unknown>,
  creatorSynth: Record<string, unknown>
): { mult: number; note?: string } {
  const brandVoice = ((brandSynth.brand_voice as string) || "").toLowerCase().trim();
  const creatorVibe = ((creatorSynth.content_category as string) || (creatorSynth.vibe as string) || "").toLowerCase().trim();
  if (!brandVoice || !creatorVibe) return { mult: 1.0 };
  const lookup = VIBE_BRAND_INCOMPATIBILITY[brandVoice]?.[creatorVibe];
  if (!lookup) return { mult: 1.0 };
  return { mult: lookup, note: `vibe clash (brand=${brandVoice} × creator=${creatorVibe})` };
}

function platformPreferencePenalty(
  creatorPlatform: string | null,
  brandPreference: string | null
): number {
  // No preference or "any" → no penalty
  if (!brandPreference || brandPreference === "any") return 1.0;
  if (!creatorPlatform) return 0.9; // unknown platform gets mild penalty
  // Exact match → no penalty
  if (creatorPlatform === brandPreference) return 1.0;
  // Newsletter platforms are interchangeable
  const newsletterPlatforms = new Set(["beehiiv", "substack", "convertkit", "mailchimp", "newsletter"]);
  if (brandPreference === "newsletter" && newsletterPlatforms.has(creatorPlatform)) return 1.0;
  // Cross-platform: mild penalty (0.85) — still shows up if audience fit is strong
  return 0.85;
}

// ── Brand intelligence shape normalizer ──
// Historical and current brand_intelligence rows are stored as the raw
// Haiku extraction output: flat keys product_category, target_customer,
// audience_they_want, content_themes_they_align_with, budget_signals,
// newsletter_fit_notes. The matching engine was written against the
// SYNTHESIZED shape used by lib/intelligence/embeddings.ts:brandFingerprint
// (ideal_audience, target_profile.{profession,income_bracket,...},
// content_affinity, budget_signal, one_line_need). Until now scoreMatch
// silently degraded to {} on brand_intelligence reads, so brand-side
// signals (income_match, outcome_fit, value_tier classification) had
// no data — only creator-side signals + cosine similarity were doing
// real work.
function normalizeBrandSynth(brandIntel: Record<string, unknown>): Record<string, unknown> {
  // If already wrapped, just return the inner synth
  if (brandIntel.synthesized && typeof brandIntel.synthesized === "object") {
    return brandIntel.synthesized as Record<string, unknown>;
  }
  // Empty intel → empty synth
  if (!brandIntel || Object.keys(brandIntel).length === 0) return {};

  // Translate flat raw-Haiku keys to the synth shape the matcher expects.
  const tc = (brandIntel.target_customer as Record<string, unknown>) || {};
  return {
    product_category: brandIntel.product_category,
    ideal_audience: brandIntel.audience_they_want,
    one_line_need: brandIntel.newsletter_fit_notes,
    brand_voice: brandIntel.brand_voice,
    budget_signal: brandIntel.budget_signals,
    content_affinity: brandIntel.content_themes_they_align_with,
    target_profile: {
      profession: tc.profession,
      seniority: tc.seniority,
      company_size: tc.company_size,
      income_bracket: tc.income_bracket,
      psychographic: tc.psychographic,
      pain_points: tc.pain_points,
    },
    competitors: brandIntel.competitors,
    // Keep raw too in case downstream reads it
    _raw: brandIntel,
  };
}

// ── Brand-safety filtering ──
// Echo's audience profiler emits per-dimension 1-10 charge scores on
// content_intelligence.synthesized.{political,controversy,nsfw,...}_charge.
// (See leadgen/workers/echo/profile_sync.py.) The matcher uses them in
// two ways:
//  - HARD filter: nsfw_charge≥7 always; political_charge≥7 unless brand
//    intel signals politics-tolerance; conspiracy_charge≥7 always.
//  - SOFT penalty: multiplicative on the final score for medium charge
//    levels. Lets borderline content surface only when other signals
//    (audience, embedding, income) are very strong.
//
// Real (non-shadow) creators have no charge fields → defaults to 1 →
// never filtered. Safe-by-default.

const POLITICS_TOLERANT_KEYWORDS = /\b(political|politics|news|policy|government|election|civic|advocacy|public.affairs|journalism|opinion)\b/i;

function brandToleratesPolitics(brandSynth: Record<string, unknown>): boolean {
  const aff = (brandSynth.content_affinity as string[] || []).join(" ");
  const pitch = (brandSynth.one_line_need as string) || "";
  const themes = (brandSynth.brand_voice as string) || "";
  const haystack = `${aff} ${pitch} ${themes}`;
  return POLITICS_TOLERANT_KEYWORDS.test(haystack);
}

function chargeNum(creatorSynth: Record<string, unknown>, key: string): number {
  const v = creatorSynth[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return 1; // safe default — no data → treat as clean
}

interface SafetyVerdict {
  hardFilter: boolean;
  reason?: string;
  softMultiplier: number;
  notes: string[];
}

function evaluateSafety(
  creatorSynth: Record<string, unknown>,
  brandSynth: Record<string, unknown>
): SafetyVerdict {
  const pol = chargeNum(creatorSynth, "political_charge");
  const con = chargeNum(creatorSynth, "controversy_charge");
  const nsfw = chargeNum(creatorSynth, "nsfw_charge");
  const conspiracy = chargeNum(creatorSynth, "conspiracy_charge");
  const violence = chargeNum(creatorSynth, "violence_charge");

  // Hard filters — applied to ALL brands regardless of preference.
  if (nsfw >= 7) return { hardFilter: true, reason: "creator nsfw_charge≥7", softMultiplier: 0, notes: [] };
  if (conspiracy >= 7) return { hardFilter: true, reason: "creator conspiracy_charge≥7", softMultiplier: 0, notes: [] };
  if (violence >= 7) return { hardFilter: true, reason: "creator violence_charge≥7", softMultiplier: 0, notes: [] };

  const tolerantOfPolitics = brandToleratesPolitics(brandSynth);
  if (pol >= 7 && !tolerantOfPolitics) {
    return { hardFilter: true, reason: "creator political_charge≥7, brand not politics-tolerant", softMultiplier: 0, notes: [] };
  }

  // Soft penalties stack multiplicatively
  let mult = 1.0;
  const notes: string[] = [];
  if (pol >= 4 && !tolerantOfPolitics) {
    mult *= 0.6;
    notes.push(`politics dampener (charge=${pol})`);
  }
  if (con >= 7) {
    mult *= 0.7;
    notes.push(`controversy dampener (charge=${con})`);
  }
  if (con >= 4 && con < 7) {
    mult *= 0.85;
    notes.push(`mild controversy (charge=${con})`);
  }

  return { hardFilter: false, softMultiplier: mult, notes };
}

export interface MatchResult {
  score: number;
  value_tier: string;
  components: Record<string, number>;
  explanation: string;
}

export function scoreMatch(
  creator: Record<string, unknown>,
  brand: Record<string, unknown>
): MatchResult {
  let creatorIntel = (creator.content_intelligence || {}) as Record<string, unknown>;
  let brandIntel = (brand.brand_intelligence || {}) as Record<string, unknown>;
  if (typeof creatorIntel === "string") creatorIntel = JSON.parse(creatorIntel);
  if (typeof brandIntel === "string") brandIntel = JSON.parse(brandIntel);

  const creatorSynth = (creatorIntel.synthesized || {}) as Record<string, unknown>;
  const brandSynth = normalizeBrandSynth(brandIntel);

  // Safety filter — applied BEFORE expensive cosine work. Hard filters
  // short-circuit to score=0 with an explanation; soft penalties apply
  // as a multiplier on the final raw score.
  const safety = evaluateSafety(creatorSynth, brandSynth);
  if (safety.hardFilter) {
    return {
      score: 0,
      value_tier: classifyValueTier(brandIntel),
      components: {
        cosine_similarity: 0, audience_size_fit: 0, advertiser_friendliness: 0,
        content_consistency: 0, income_match: 0, outcome_fit: 0,
      },
      explanation: `0% match — hard-filtered: ${safety.reason}`,
    };
  }

  // Cosine similarity
  let cosSim = 0;
  const creatorEmb = creator.profile_embedding;
  const brandEmb = brand.profile_embedding;
  if (creatorEmb && brandEmb) {
    const a = typeof creatorEmb === "string" ? JSON.parse(creatorEmb) : creatorEmb;
    const b = typeof brandEmb === "string" ? JSON.parse(brandEmb) : brandEmb;
    cosSim = Math.max(cosineSimilarity(a as number[], b as number[]), 0);
  }

  // audience_reach is the universal headline number (subscribers/followers/downloads).
  // Falls back to subscriber_count for rows that predate the migration.
  const reach = (creator.audience_reach as number) || (creator.subscriber_count as number) || 0;
  let sizeFit: number | null = null;
  if (reach && brand.budget_range) {
    let s = audienceSizeFit(reach, (brand.budget_range as string), brandIntel);
    s = applySizePreference(s, reach, (brand.preferred_creator_size as string) || null);
    sizeFit = s;
  }

  // Advertiser-friendliness only counts if the creator was actually profiled
  // (otherwise default-5 polluted the score for every un-profiled creator).
  const afRaw = (creatorSynth.advertiser_friendliness as number);
  const afScore: number | null = (typeof afRaw === "number" && Number.isFinite(afRaw)) ? Math.min(afRaw / 10, 1.0) : null;

  const consRaw = (creatorSynth.content_consistency as number);
  const consistency: number | null = (typeof consRaw === "number" && Number.isFinite(consRaw)) ? consRaw : null;

  const cIncome = ((creatorSynth.audience_profile as Record<string, unknown>)?.likely_income_bracket as string) || "";
  const bIncome = ((brandSynth.target_profile as Record<string, unknown>)?.income_bracket as string) || "";
  const cIncomeKnown = !!cIncome && cIncome !== "unknown" && cIncome in INCOME_MAP;
  const bIncomeKnown = !!bIncome && bIncome !== "unknown" && bIncome in INCOME_MAP;
  const income: number | null = (cIncomeKnown && bIncomeKnown) ? incomeMatch(cIncome, bIncome) : null;

  const outcome: number | null = brand.campaign_outcome ? outcomeFit(creatorSynth, creator, (brand.campaign_outcome as string)) : null;

  // NEW: engagement rate as a top-level factor
  const engagement = engagementScore(creator);

  // NEW: price fit (hard-filters when creator is grossly out of budget)
  const creatorPrice = (creator.price_per_placement as number) || null;
  const { score: price, hardFail: priceHardFail } = priceFit(creatorPrice, (brand.budget_range as string) || null);
  if (priceHardFail) {
    return {
      score: 0,
      value_tier: classifyValueTier(brandIntel),
      components: {
        cosine_similarity: 0, audience_size_fit: 0, advertiser_friendliness: 0,
        content_consistency: 0, income_match: 0, outcome_fit: 0,
        engagement_rate: 0, price_fit: 0,
      },
      explanation: `0% match — hard-filtered: creator price ($${creatorPrice}) >2× brand budget`,
    };
  }

  // ── Active-component normalization ──
  // Components with no data (null) are excluded from BOTH the numerator
  // and the denominator. Score = sum(weight*value) / sum(weight). A row
  // with rich data isn't penalized vs a row with sparse data.
  const componentInputs: Array<{ key: string; value: number | null; weight: number }> = [
    { key: "cosine_similarity",       value: cosSim || null,    weight: 0.35 },
    { key: "audience_size_fit",       value: sizeFit,           weight: 0.10 },
    { key: "engagement_rate",         value: engagement,        weight: 0.10 },
    { key: "price_fit",               value: price,             weight: 0.10 },
    { key: "outcome_fit",             value: outcome,           weight: 0.10 },
    { key: "advertiser_friendliness", value: afScore,           weight: 0.08 },
    { key: "income_match",            value: income,            weight: 0.07 },
    { key: "content_consistency",     value: consistency,       weight: 0.05 },
    // Remaining 5% capacity is the LLM re-rank shift in lib/intelligence/rerank.ts
  ];
  let activeNum = 0;
  let activeDen = 0;
  for (const c of componentInputs) {
    if (c.value !== null && Number.isFinite(c.value)) {
      activeNum += c.weight * c.value;
      activeDen += c.weight;
    }
  }
  const rawTotal = activeDen > 0 ? activeNum / activeDen : 0;

  // Multipliers
  const platformMult = platformPreferencePenalty(
    (creator.platform as string) || null,
    (brand.preferred_creator_type as string) || null
  );
  const competitor = competitorOverlapMultiplier(brandSynth, creatorSynth);
  const vibe = vibeMismatchMultiplier(brandSynth, creatorSynth);

  const total = rawTotal * platformMult * safety.softMultiplier * competitor.mult * vibe.mult;

  const components: Record<string, number> = {
    cosine_similarity: Math.round((cosSim || 0) * 1000) / 1000,
    audience_size_fit: Math.round((sizeFit ?? 0) * 1000) / 1000,
    engagement_rate: Math.round((engagement ?? 0) * 1000) / 1000,
    price_fit: Math.round((price ?? 0) * 1000) / 1000,
    outcome_fit: Math.round((outcome ?? 0) * 1000) / 1000,
    advertiser_friendliness: Math.round((afScore ?? 0) * 1000) / 1000,
    income_match: Math.round((income ?? 0) * 1000) / 1000,
    content_consistency: Math.round((consistency ?? 0) * 1000) / 1000,
  };

  // Explanation
  const parts = [`${Math.round(total * 100)}% match`];
  const cAudience = creatorSynth.one_line_profile as string;
  const bAudience = brandSynth.ideal_audience as string;
  if (cAudience && bAudience) {
    parts.push(`${creator.newsletter_name || "Creator"}'s audience (${cAudience}) aligns with ${brand.company_name || "brand"}'s target (${bAudience})`);
  }
  if (sizeFit !== null && sizeFit >= 0.8) parts.push("Audience size matches budget well");
  if (engagement !== null && engagement >= 0.8) parts.push("Strong engagement rate");
  if (engagement !== null && engagement <= 0.2) parts.push("⚠ Low engagement rate");
  if (price !== null && price >= 0.8) parts.push("Price fits budget");
  if (price !== null && price <= 0.4) parts.push("⚠ Price tight against budget");
  if (afScore !== null && afScore >= 0.8) parts.push("Brand-safe content");
  if (income !== null && income >= 0.8) parts.push("Audience income matches target");
  if (outcome !== null && outcome >= 0.8 && brand.campaign_outcome) parts.push(`Strong ${brand.campaign_outcome} potential`);
  if (platformMult < 1.0) {
    const creatorPlat = (creator.platform as string) || "other";
    const brandPref = (brand.preferred_creator_type as string) || "any";
    parts.push(`Cross-platform match (you lean ${brandPref}, this creator is ${creatorPlat} — but the audience fit is strong)`);
  }
  if (competitor.matched.length) parts.push(`⚠ Competitor overlap: creator previously sponsored ${competitor.matched.join(", ")}`);
  if (vibe.note) parts.push(`⚠ ${vibe.note}`);

  const cTopics = new Set(creatorSynth.top_topics as string[] || []);
  const bThemes = new Set(brandSynth.content_affinity as string[] || []);
  const shared = [...cTopics].filter(t => bThemes.has(t)).slice(0, 3);
  if (shared.length) parts.push(`Shared themes: ${shared.join(", ")}`);
  if (safety.notes.length) parts.push(`Safety: ${safety.notes.join("; ")}`);

  return {
    score: Math.round(total * 1000) / 1000,
    value_tier: classifyValueTier(brandIntel),
    components,
    explanation: parts.join(" — "),
  };
}

export interface ProfileIncompleteResult {
  profile_incomplete: true;
  match_eligibility_score: number;
  missing_fields: string[];
  message: string;
}

function brandMissingFields(brand: Record<string, unknown>): string[] {
  const missing: string[] = [];
  const productDesc = (brand.product_description as string) || "";
  const targetCust = (brand.target_customer as string) || "";
  if (productDesc.length < 50) missing.push("product_description (≥50 chars — what you sell)");
  if (targetCust.length < 50) missing.push("target_customer (≥50 chars — who buys from you)");
  if (!brand.budget_range) missing.push("budget_range (per-creator sponsorship budget)");
  if (!brand.campaign_outcome) missing.push("campaign_outcome (reach / engagement / conversions / credibility)");
  if (!brand.profile_embedding) missing.push("profile_embedding (auto-computed once intel is filled)");
  return missing;
}

export async function getMatchesForBrand(
  brandId: string,
  limit = 20,
  opts?: { numericOnly?: boolean; explain?: boolean }
): Promise<unknown[] | ProfileIncompleteResult> {
  const supabase = createServiceClient();

  // The requesting brand MUST be real (lookup in the filtered view — shadows are invisible).
  // Only real users ever ask for matches.
  const { data: brand } = await supabase
    .from("business_profiles")
    .select("id, company_name, product_description, target_customer, primary_niche, budget_range, campaign_outcome, preferred_creator_type, preferred_creator_size, brand_intelligence, profile_embedding, match_eligible, match_eligibility_score")
    .eq("id", brandId)
    .eq("is_active", true)
    .single();

  if (!brand) return [];

  // Quality gate: requesting brand must be match-eligible. If not, return
  // a structured "profile_incomplete" response listing missing fields so
  // the caller (WhatsApp bot, widget, dashboard) can nudge the user
  // toward completion. Better than showing a low-quality match they'd
  // distrust.
  if (!brand.match_eligible) {
    const missing = brandMissingFields(brand as Record<string, unknown>);
    return {
      profile_incomplete: true,
      match_eligibility_score: (brand.match_eligibility_score as number) || 0,
      missing_fields: missing,
      message: `Your profile is ${(brand.match_eligibility_score as number) || 0}% complete. To unlock matches, fill in: ${missing.join(", ")}.`,
    };
  }

  // Counterparty lookup — only match-eligible creators. The new
  // match_eligible filter on the directory view is what enforces the
  // quality bar. Pre-eligible creators stay in the DB for claim/onboarding
  // but never surface as match candidates.
  const { data: creators } = await supabase
    .from("newsletter_directory")
    .select("id, newsletter_name, primary_niche, subscriber_count, audience_reach, engagement_rate, platform, platform_metrics, content_intelligence, profile_embedding, onboarding_status, price_per_placement, match_eligibility_score")
    .eq("is_active", true)
    .eq("match_eligible", true)
    .not("profile_embedding", "is", null);

  if (!creators?.length) return [];

  const matches = creators.map(creator => {
    const result = scoreMatch(creator, brand);
    return {
      creator_id: creator.id,
      creator_name: creator.newsletter_name,
      subscriber_count: creator.subscriber_count,
      audience_reach: (creator.audience_reach as number) || (creator.subscriber_count as number) || null,
      platform: creator.platform || "newsletter",
      engagement_rate: creator.engagement_rate || null,
      primary_niche: creator.primary_niche,
      counterparty_status: creator.onboarding_status as string,
      price_per_placement: (creator.price_per_placement as number) || null,
      cross_platform: platformPreferencePenalty((creator.platform as string) || null, (brand.preferred_creator_type as string) || null) < 1.0,
      ...result,
    };
  });

  const numericRanked = matches.sort((a, b) => b.score - a.score);

  // ── LLM re-rank on top 50 (fires unless ?numeric_only=1) ──
  if (opts?.numericOnly) {
    if (opts.explain) {
      // Attach diagnostic info even on numeric path
      return Object.assign(numericRanked.slice(0, limit), {
        _diag: { mode: "numeric_only", total_candidates: numericRanked.length },
      });
    }
    return numericRanked.slice(0, limit);
  }
  const top50 = numericRanked.slice(0, 50);
  if (top50.length <= 1) return top50.slice(0, limit);

  const { rerankCandidates } = await import("./rerank");
  const brandIntel = (brand.brand_intelligence as Record<string, unknown>) || {};

  // Phase 4 memory: pull the brand's last 5 decisions so the rerank can
  // demote past-decline lookalikes and boost past-acceptance lookalikes.
  // Joined to creator_name so the model has a recognizable label, not
  // just a UUID. Empty result → rerank prompt is unchanged from before.
  type PriorRow = {
    decided_at: string;
    decision: string;
    reason: string | null;
    newsletter_profiles_all: { newsletter_name: string | null } | null;
  };
  const { data: priorRows } = await supabase
    .from("match_decisions")
    .select(`
      decided_at, decision, reason,
      newsletter_profiles_all:creator_id (newsletter_name)
    `)
    .eq("brand_id", brandId)
    .in("decision", ["brand_yes", "brand_no", "creator_yes", "creator_no", "introduced", "no_response_3d"])
    .order("decided_at", { ascending: false })
    .limit(5);

  const priorDecisions = ((priorRows || []) as unknown as PriorRow[]).map(r => ({
    decided_at: (r.decided_at || "").slice(0, 10),  // YYYY-MM-DD
    creator_name: r.newsletter_profiles_all?.newsletter_name || "(unknown creator)",
    decision: r.decision,
    reason: r.reason ?? null,
  }));

  // Phase 5 — Implicit graph: pull creators flagged as "graph-recommended"
  // for this brand (based on what similar brands have successfully sponsored).
  // Returns [] until we have ≥30 completed deals globally; signal activates
  // automatically as deal count grows. Pass to the rerank prompt as a
  // boost-list — the LLM uses it to nudge those candidates upward.
  const { getGraphRecommendedCreators } = await import("./graph");
  const graphRecommended = await getGraphRecommendedCreators(supabase, brandId);
  const graphCreatorIds = new Set(graphRecommended.map(g => g.creator_id));
  const rerankResult = await rerankCandidates(
    brand as unknown as Record<string, unknown>,
    brandIntel,
    top50.map(m => {
      const creatorRow = creators.find(c => c.id === m.creator_id);
      const ci = (creatorRow?.content_intelligence as Record<string, unknown>) || {};
      const synth = (ci.synthesized as Record<string, unknown>) || {};
      const pieces: string[] = [];
      if (m.primary_niche) pieces.push(`Niche: ${m.primary_niche}`);
      if (synth.one_line_profile) pieces.push(`Audience: ${synth.one_line_profile}`);
      if (synth.content_category) pieces.push(`Vibe: ${synth.content_category}`);
      if (m.audience_reach) pieces.push(`Reach: ${m.audience_reach.toLocaleString()}`);
      if (m.engagement_rate) pieces.push(`Engagement: ${(m.engagement_rate * 100).toFixed(1)}%`);
      if (m.price_per_placement) pieces.push(`Price: $${m.price_per_placement}`);
      // Phase 5: graph-recommended boost — the LLM sees a small breadcrumb
      // here and uses it as one signal among many. Not a hard override.
      if (graphCreatorIds.has(m.creator_id)) {
        const g = graphRecommended.find(x => x.creator_id === m.creator_id);
        pieces.push(`★ Graph: similar brand "${g?.via_similar_brand}" successfully sponsored this creator`);
      }
      return {
        creator_id: m.creator_id,
        creator_name: m.creator_name as string,
        numerical_score: m.score,
        components: m.components,
        creator_summary: pieces.join(" | "),
      };
    }),
    Math.min(limit, 50),
    priorDecisions
  );

  // Merge rerank back onto match objects
  const byId = new Map(top50.map(m => [m.creator_id, m]));
  const reranked = rerankResult.ranked
    .map(r => {
      const base = byId.get(r.creator_id);
      if (!base) return null;
      return {
        ...base,
        score: Math.round(r.final_score * 1000) / 1000,
        llm_reasoning: r.llm_reasoning,
        llm_position: r.llm_position,
        explanation: r.llm_reasoning && rerankResult.used_llm
          ? `${Math.round(r.final_score * 100)}% — ${r.llm_reasoning} | ${base.explanation}`
          : base.explanation,
      };
    })
    .filter(Boolean);

  const out = reranked.slice(0, limit);
  if (opts?.explain) {
    return Object.assign(out, {
      _diag: {
        mode: "reranked",
        used_llm: rerankResult.used_llm,
        rerank_error: rerankResult.error,
        numerical_top50: top50.slice(0, 5).map(m => ({ id: m.creator_id, name: m.creator_name, score: m.score })),
        rerank_returned: rerankResult.ranked.length,
        prior_decisions_injected: priorDecisions.length,
        prior_decisions_sample: priorDecisions.slice(0, 3),
      },
    });
  }
  return out;
}

function creatorMissingFields(creator: Record<string, unknown>): string[] {
  const missing: string[] = [];
  if (!creator.audience_reach) missing.push("audience_reach (subscribers/followers/downloads)");
  if (!creator.engagement_rate && !creator.avg_open_rate) {
    missing.push("engagement_rate or avg_open_rate (typical open rate or engagement signal)");
  }
  const desc = (creator.description as string) || "";
  if (desc.length < 100) missing.push("description (≥100 chars — describe your audience)");
  if (!creator.price_per_placement && !creator.open_to_inquiries) {
    missing.push("price_per_placement OR open_to_inquiries=true (set a price or opt in to inquiries)");
  }
  if (!creator.profile_embedding) missing.push("profile_embedding (auto-computed once intel is filled)");
  return missing;
}

export async function getMatchesForCreator(
  creatorId: string,
  limit = 20
): Promise<unknown[] | ProfileIncompleteResult> {
  const supabase = createServiceClient();

  const { data: creator } = await supabase
    .from("newsletter_profiles")
    .select("id, newsletter_name, primary_niche, subscriber_count, audience_reach, engagement_rate, avg_open_rate, description, platform, content_intelligence, profile_embedding, price_per_placement, open_to_inquiries, match_eligible, match_eligibility_score")
    .eq("id", creatorId)
    .eq("is_active", true)
    .single();

  if (!creator) return [];

  if (!creator.match_eligible) {
    const missing = creatorMissingFields(creator as Record<string, unknown>);
    return {
      profile_incomplete: true,
      match_eligibility_score: (creator.match_eligibility_score as number) || 0,
      missing_fields: missing,
      message: `Your profile is ${(creator.match_eligibility_score as number) || 0}% complete. To unlock brand matches, fill in: ${missing.join(", ")}.`,
    };
  }

  const { data: brands } = await supabase
    .from("business_directory")
    .select("id, company_name, primary_niche, budget_range, campaign_outcome, preferred_creator_type, preferred_creator_size, brand_intelligence, profile_embedding, onboarding_status, match_eligibility_score")
    .eq("is_active", true)
    .eq("match_eligible", true)
    .not("profile_embedding", "is", null);

  if (!brands?.length) return [];

  const matches = brands.map(brand => {
    const result = scoreMatch(creator, brand);
    return {
      brand_id: brand.id,
      brand_name: brand.company_name,
      budget_range: brand.budget_range,
      primary_niche: brand.primary_niche,
      counterparty_status: brand.onboarding_status as string,
      ...result,
    };
  });

  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}
