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
  const synth = (brandIntel.synthesized || {}) as Record<string, unknown>;
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
  const brandSynth = (brandIntel.synthesized || {}) as Record<string, unknown>;

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
  const sizeFit = audienceSizeFit(reach, (brand.budget_range as string) || "", brandIntel);

  const af = (creatorSynth.advertiser_friendliness as number) ?? 5;
  const afScore = Math.min(af / 10, 1.0);

  const consistency = (creatorSynth.content_consistency as number) ?? 0.5;

  const cIncome = ((creatorSynth.audience_profile as Record<string, unknown>)?.likely_income_bracket as string) || "unknown";
  const bIncome = ((brandSynth.target_profile as Record<string, unknown>)?.income_bracket as string) || "unknown";
  const income = incomeMatch(cIncome, bIncome);

  const total = 0.50 * cosSim + 0.15 * sizeFit + 0.10 * afScore + 0.10 * consistency + 0.10 * income + 0.05 * 0; // competitor signal omitted for perf

  const components = {
    cosine_similarity: Math.round(cosSim * 1000) / 1000,
    audience_size_fit: Math.round(sizeFit * 1000) / 1000,
    advertiser_friendliness: Math.round(afScore * 1000) / 1000,
    content_consistency: Math.round(consistency * 1000) / 1000,
    income_match: Math.round(income * 1000) / 1000,
  };

  // Explanation
  const parts = [`${Math.round(total * 100)}% match`];
  const cAudience = creatorSynth.one_line_profile as string;
  const bAudience = brandSynth.ideal_audience as string;
  if (cAudience && bAudience) {
    parts.push(`${creator.newsletter_name || "Creator"}'s audience (${cAudience}) aligns with ${brand.company_name || "brand"}'s target (${bAudience})`);
  }
  if (sizeFit >= 0.8) parts.push("Audience size matches budget well");
  if (afScore >= 0.8) parts.push("Brand-safe content");
  if (income >= 0.8) parts.push("Audience income matches target");

  const cTopics = new Set(creatorSynth.top_topics as string[] || []);
  const bThemes = new Set(brandSynth.content_affinity as string[] || []);
  const shared = [...cTopics].filter(t => bThemes.has(t)).slice(0, 3);
  if (shared.length) parts.push(`Shared themes: ${shared.join(", ")}`);

  return {
    score: Math.round(total * 1000) / 1000,
    value_tier: classifyValueTier(brandIntel),
    components,
    explanation: parts.join(" — "),
  };
}

export async function getMatchesForBrand(brandId: string, limit = 20) {
  const supabase = createServiceClient();

  // The requesting brand MUST be real (lookup in the filtered view — shadows are invisible).
  // Only real users ever ask for matches.
  const { data: brand } = await supabase
    .from("business_profiles")
    .select("id, company_name, product_description, target_customer, primary_niche, budget_range, brand_intelligence, profile_embedding")
    .eq("id", brandId)
    .eq("is_active", true)
    .single();

  if (!brand) return [];

  // Counterparty lookup hits the directory view — sees real + shadow creators.
  // Each returned match carries counterparty_status so the introduction-proposal
  // code can branch: whatsapp_active → normal double-opt-in, shadow → fire
  // claim-flow outreach and park the intro as 'awaiting_claim'.
  const { data: creators } = await supabase
    .from("newsletter_directory")
    .select("id, newsletter_name, primary_niche, subscriber_count, audience_reach, engagement_rate, platform, platform_metrics, content_intelligence, profile_embedding, onboarding_status")
    .eq("is_active", true)
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
      ...result,
    };
  });

  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function getMatchesForCreator(creatorId: string, limit = 20) {
  const supabase = createServiceClient();

  const { data: creator } = await supabase
    .from("newsletter_profiles")
    .select("id, newsletter_name, primary_niche, subscriber_count, audience_reach, engagement_rate, platform, content_intelligence, profile_embedding")
    .eq("id", creatorId)
    .eq("is_active", true)
    .single();

  if (!creator) return [];

  const { data: brands } = await supabase
    .from("business_directory")
    .select("id, company_name, primary_niche, budget_range, brand_intelligence, profile_embedding, onboarding_status")
    .eq("is_active", true)
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
