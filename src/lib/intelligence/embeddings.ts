/**
 * Embeddings — generates and stores vector embeddings for semantic matching.
 * Uses Voyage AI (voyage-3-lite, 1024 dims, zero-padded to 1536 for pgvector).
 */

import { createServiceClient } from "@/lib/supabase";

const PGVECTOR_DIM = 1536;
const VOYAGE_MODEL = "voyage-3-lite";

// ── Fingerprint generation ──

export function creatorFingerprint(intelligence: Record<string, unknown>): string {
  const synth = (intelligence.synthesized || {}) as Record<string, unknown>;
  if (!Object.keys(synth).length) return "";

  const parts: string[] = [];
  const audience = (synth.audience_profile || {}) as Record<string, unknown>;

  if (audience.likely_profession) parts.push(`Readers are ${audience.likely_profession}`);
  if (audience.likely_seniority) parts.push(`at ${audience.likely_seniority} level`);
  if (audience.top_interests) parts.push(`interested in ${(audience.top_interests as string[]).slice(0, 5).join(", ")}`);
  if (synth.one_line_profile) parts.push(synth.one_line_profile as string);
  if (synth.top_topics) parts.push(`Topics: ${(synth.top_topics as string[]).slice(0, 6).join(", ")}`);
  if (synth.content_category) parts.push(`Category: ${synth.content_category}`);
  if (synth.writing_style) parts.push(`Style: ${synth.writing_style}`);

  const af = synth.advertiser_friendliness as number;
  if (af != null) {
    if (af >= 8) parts.push("Very advertiser-friendly");
    else if (af >= 6) parts.push("Moderately advertiser-friendly");
    else if (af < 4) parts.push("Edgy or controversial content");
  }

  return parts.join(". ");
}

// Normalize brand_intelligence shape — handles both legacy (synthesized
// wrapper) and current (raw Haiku flat keys) layouts. Keep in sync with
// normalizeBrandSynth in matching.ts. The matcher and the embedder must
// agree on the shape, otherwise embeddings are computed from wrong fields.
export function normalizeBrandSynth(intelligence: Record<string, unknown>): Record<string, unknown> {
  if (intelligence?.synthesized && typeof intelligence.synthesized === "object") {
    return intelligence.synthesized as Record<string, unknown>;
  }
  if (!intelligence || Object.keys(intelligence).length === 0) return {};
  const tc = (intelligence.target_customer as Record<string, unknown>) || {};
  return {
    product_category: intelligence.product_category,
    ideal_audience: intelligence.audience_they_want,
    one_line_need: intelligence.newsletter_fit_notes,
    brand_voice: intelligence.brand_voice,
    budget_signal: intelligence.budget_signals,
    content_affinity: intelligence.content_themes_they_align_with,
    target_profile: {
      profession: tc.profession,
      seniority: tc.seniority,
      company_size: tc.company_size,
      income_bracket: tc.income_bracket,
      psychographic: tc.psychographic,
      pain_points: tc.pain_points,
    },
    competitors: intelligence.competitors,
  };
}

export function brandFingerprint(intelligence: Record<string, unknown>): string {
  const synth = normalizeBrandSynth(intelligence);
  if (!Object.keys(synth).length) return "";

  const parts: string[] = [];
  if (synth.ideal_audience) parts.push(`Wants to reach: ${synth.ideal_audience}`);

  const target = (synth.target_profile || {}) as Record<string, unknown>;
  if (target.profession) parts.push(`Target: ${target.profession}`);
  if (target.seniority) parts.push(`Seniority: ${target.seniority}`);
  if (target.income_bracket) parts.push(`Income: ${target.income_bracket}`);
  if (target.psychographic) parts.push(`Buyer: ${target.psychographic}`);
  if (target.pain_points) parts.push(`Pain points: ${(target.pain_points as string[]).slice(0, 4).join(", ")}`);
  if (synth.content_affinity) parts.push(`Themes: ${(synth.content_affinity as string[]).slice(0, 6).join(", ")}`);
  if (synth.product_category) parts.push(`Product: ${synth.product_category}`);
  if (synth.brand_voice) parts.push(`Voice: ${synth.brand_voice}`);
  if (synth.one_line_need) parts.push(synth.one_line_need as string);
  if (synth.newsletter_fit) parts.push(`Fit: ${synth.newsletter_fit}`);
  if (synth.campaign_outcome) parts.push(`Primary goal: ${synth.campaign_outcome}`);
  if (synth.preferred_creator_type && synth.preferred_creator_type !== "any") {
    parts.push(`Prefers ${synth.preferred_creator_type} creators`);
  }

  return parts.join(". ");
}

// ── Voyage AI embedding ──

async function embedTexts(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.VOYAGEAI_API_KEY;
  if (!apiKey) throw new Error("VOYAGEAI_API_KEY not set");

  const resp = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input: texts, model: VOYAGE_MODEL, input_type: "document" }),
    signal: AbortSignal.timeout(30000),
  });

  if (!resp.ok) throw new Error(`Voyage API error: ${resp.status}`);
  const data = await resp.json();

  // Zero-pad to PGVECTOR_DIM
  return (data.data as { embedding: number[] }[])
    .sort((a, b) => ((a as unknown as { index?: number }).index || 0) - ((b as unknown as { index?: number }).index || 0))
    .map(d => {
      const emb = d.embedding;
      while (emb.length < PGVECTOR_DIM) emb.push(0);
      return emb;
    });
}

function vecToString(vec: number[]): string {
  return "[" + vec.join(",") + "]";
}

// ── Store embeddings ──

export async function embedCreatorProfile(
  creatorId: string,
  intelligence: Record<string, unknown>
): Promise<void> {
  const fp = creatorFingerprint(intelligence);
  if (!fp) return;

  const [embedding] = await embedTexts([fp]);
  const supabase = createServiceClient();
  await supabase
    .from("newsletter_profiles")
    .update({ profile_embedding: vecToString(embedding) })
    .eq("id", creatorId);
}

export async function embedBrandProfile(
  brandId: string,
  intelligence: Record<string, unknown>
): Promise<void> {
  const fp = brandFingerprint(intelligence);
  if (!fp) return;

  const [embedding] = await embedTexts([fp]);
  const supabase = createServiceClient();
  await supabase
    .from("business_profiles")
    .update({ profile_embedding: vecToString(embedding) })
    .eq("id", brandId);
}

export async function embedAllProfiles(): Promise<{ creators: number; brands: number }> {
  const supabase = createServiceClient();

  // Creators
  const { data: creators } = await supabase
    .from("newsletter_profiles")
    .select("id, content_intelligence")
    .eq("is_active", true)
    .not("content_intelligence", "is", null);

  let creatorsEmbedded = 0;
  const creatorTexts: string[] = [];
  const creatorIds: string[] = [];

  for (const c of creators || []) {
    const intel = typeof c.content_intelligence === "string"
      ? JSON.parse(c.content_intelligence) : c.content_intelligence;
    const fp = creatorFingerprint(intel as Record<string, unknown>);
    if (fp) { creatorTexts.push(fp); creatorIds.push(c.id); }
  }

  if (creatorTexts.length) {
    // Batch embed (Voyage supports up to 128 per call)
    for (let i = 0; i < creatorTexts.length; i += 128) {
      const batch = creatorTexts.slice(i, i + 128);
      const ids = creatorIds.slice(i, i + 128);
      const embeddings = await embedTexts(batch);
      for (let j = 0; j < ids.length; j++) {
        await supabase.from("newsletter_profiles")
          .update({ profile_embedding: vecToString(embeddings[j]) })
          .eq("id", ids[j]);
        creatorsEmbedded++;
      }
    }
  }

  // Brands
  const { data: brands } = await supabase
    .from("business_profiles")
    .select("id, brand_intelligence")
    .eq("is_active", true)
    .not("brand_intelligence", "is", null);

  let brandsEmbedded = 0;
  const brandTexts: string[] = [];
  const brandIds: string[] = [];

  for (const b of brands || []) {
    const intel = typeof b.brand_intelligence === "string"
      ? JSON.parse(b.brand_intelligence) : b.brand_intelligence;
    const fp = brandFingerprint(intel as Record<string, unknown>);
    if (fp) { brandTexts.push(fp); brandIds.push(b.id); }
  }

  if (brandTexts.length) {
    for (let i = 0; i < brandTexts.length; i += 128) {
      const batch = brandTexts.slice(i, i + 128);
      const ids = brandIds.slice(i, i + 128);
      const embeddings = await embedTexts(batch);
      for (let j = 0; j < ids.length; j++) {
        await supabase.from("business_profiles")
          .update({ profile_embedding: vecToString(embeddings[j]) })
          .eq("id", ids[j]);
        brandsEmbedded++;
      }
    }
  }

  return { creators: creatorsEmbedded, brands: brandsEmbedded };
}
