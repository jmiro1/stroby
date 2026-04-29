/**
 * Phase 5 — Implicit graph from closed deals.
 *
 * Two collaborative-filtering matrices recomputed weekly from the
 * `introductions` table:
 *   - brand_brand_similarity: cosine over creator-id sets per brand
 *   - creator_creator_substitutability: cosine over brand-id sets per creator
 *
 * Both gated on COMPLETED_DEALS_THRESHOLD globally — below it, the
 * matrices are too sparse to mean anything and the matching engine
 * skips the graph entirely. Activates organically as deals accumulate.
 *
 * Wired into:
 *   - /api/jobs/run-matching cron (Sunday gate inside the daily fire) — recomputes
 *   - intelligence/matching.ts:getMatchesForBrand — reads brand_brand_similarity
 *     to flag "graph-recommended" creators in the rerank prompt
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const COMPLETED_DEALS_THRESHOLD = 30;
const TOP_SIMILAR_BRANDS_FOR_BOOST = 3;
const MIN_COSINE_FOR_BOOST = 0.15;

export interface GraphRecommendedCreator {
  creator_id: string;
  creator_name: string;
  via_similar_brand: string;     // name of the brand whose deal flagged this
  similarity: number;             // cosine score 0-1
}

/**
 * Read brand_brand_similarity for a given brand, find creators that
 * brand's top-N similar brands have successfully introduced. Returns
 * those creators as boost candidates for the rerank prompt.
 *
 * Returns [] if the global completed-deals threshold isn't met yet OR
 * if the brand has no similar peers OR if the similarity matrix is
 * empty (first-run before recompute has happened).
 */
export async function getGraphRecommendedCreators(
  supabase: SupabaseClient,
  brandId: string
): Promise<GraphRecommendedCreator[]> {
  // Gate: count completed introductions globally
  const { count: completedCount } = await supabase
    .from("introductions")
    .select("id", { count: "exact", head: true })
    .in("status", ["introduced", "completed"]);
  if ((completedCount ?? 0) < COMPLETED_DEALS_THRESHOLD) {
    return [];
  }

  // Find this brand's top similar peers. Query both directions because
  // the table stores canonical (a<b) ordering.
  type SimRow = { brand_a_id: string; brand_b_id: string; cosine_score: number };
  const { data: simRowsA } = await supabase
    .from("brand_brand_similarity")
    .select("brand_a_id, brand_b_id, cosine_score")
    .eq("brand_a_id", brandId)
    .gte("cosine_score", MIN_COSINE_FOR_BOOST)
    .order("cosine_score", { ascending: false })
    .limit(TOP_SIMILAR_BRANDS_FOR_BOOST);
  const { data: simRowsB } = await supabase
    .from("brand_brand_similarity")
    .select("brand_a_id, brand_b_id, cosine_score")
    .eq("brand_b_id", brandId)
    .gte("cosine_score", MIN_COSINE_FOR_BOOST)
    .order("cosine_score", { ascending: false })
    .limit(TOP_SIMILAR_BRANDS_FOR_BOOST);

  const simBrands = new Map<string, number>();  // peer_id → cosine
  for (const r of (simRowsA || []) as SimRow[]) {
    simBrands.set(r.brand_b_id, Math.max(simBrands.get(r.brand_b_id) ?? 0, r.cosine_score));
  }
  for (const r of (simRowsB || []) as SimRow[]) {
    simBrands.set(r.brand_a_id, Math.max(simBrands.get(r.brand_a_id) ?? 0, r.cosine_score));
  }
  if (simBrands.size === 0) return [];

  const peerIds = [...simBrands.keys()].slice(0, TOP_SIMILAR_BRANDS_FOR_BOOST);

  // Fetch the peers' completed introductions (creators they paid)
  type IntroRow = {
    business_id: string;
    newsletter_id: string | null;
    creator_id: string | null;
    business_profiles_all: { company_name: string | null } | null;
    newsletter_profiles_all: { newsletter_name: string | null } | null;
  };
  const { data: peerIntros } = await supabase
    .from("introductions")
    .select(`
      business_id, newsletter_id, creator_id,
      business_profiles_all:business_id (company_name),
      newsletter_profiles_all:newsletter_id (newsletter_name)
    `)
    .in("business_id", peerIds)
    .in("status", ["introduced", "completed"]);

  const recommended: GraphRecommendedCreator[] = [];
  const seen = new Set<string>();
  for (const r of (peerIntros || []) as unknown as IntroRow[]) {
    const cid = r.newsletter_id || r.creator_id;
    if (!cid || seen.has(cid)) continue;
    seen.add(cid);
    recommended.push({
      creator_id: cid,
      creator_name: r.newsletter_profiles_all?.newsletter_name || "(creator)",
      via_similar_brand: r.business_profiles_all?.company_name || "(similar brand)",
      similarity: simBrands.get(r.business_id) ?? 0,
    });
  }

  return recommended;
}

/**
 * Recompute brand_brand_similarity + creator_creator_substitutability
 * from the current introductions table. Idempotent — wipes both tables
 * and rewrites. Cheap at our volumes (deal count is in the tens-to-low-
 * hundreds for the foreseeable future).
 *
 * Cosine over set vectors: |A ∩ B| / sqrt(|A| * |B|).
 */
export async function recomputeGraph(
  supabase: SupabaseClient
): Promise<{ brandPairs: number; creatorPairs: number; deals: number }> {
  const { data: deals } = await supabase
    .from("introductions")
    .select("business_id, newsletter_id, creator_id, creator_type, status")
    .in("status", ["introduced", "completed"]);

  // Build the bipartite (brand → creators) and (creator → brands) maps
  const brandToCreators = new Map<string, Set<string>>();
  const creatorToBrands = new Map<string, Set<string>>();
  for (const d of deals || []) {
    const cid = (d.newsletter_id as string) || (d.creator_id as string);
    if (!cid || !d.business_id) continue;
    if (!brandToCreators.has(d.business_id as string)) {
      brandToCreators.set(d.business_id as string, new Set());
    }
    brandToCreators.get(d.business_id as string)!.add(cid);
    if (!creatorToBrands.has(cid)) creatorToBrands.set(cid, new Set());
    creatorToBrands.get(cid)!.add(d.business_id as string);
  }

  const dealCount = (deals || []).length;
  if (dealCount < COMPLETED_DEALS_THRESHOLD) {
    // Still record stats so we know the recompute ran; just don't bother
    // computing similarity since the result would be noise.
    return { brandPairs: 0, creatorPairs: 0, deals: dealCount };
  }

  // Brand-brand cosine — only pairs sharing ≥1 creator are interesting
  const brandRows: Array<{
    brand_a_id: string; brand_b_id: string;
    cosine_score: number; shared_creator_count: number;
  }> = [];
  const brands = [...brandToCreators.keys()];
  for (let i = 0; i < brands.length; i++) {
    for (let j = i + 1; j < brands.length; j++) {
      const a = brands[i], b = brands[j];
      // Canonical ordering — the unique constraint requires a < b
      const [aId, bId] = a < b ? [a, b] : [b, a];
      const setA = brandToCreators.get(a)!;
      const setB = brandToCreators.get(b)!;
      const shared = [...setA].filter(x => setB.has(x)).length;
      if (shared === 0) continue;
      const cosine = shared / Math.sqrt(setA.size * setB.size);
      brandRows.push({
        brand_a_id: aId, brand_b_id: bId,
        cosine_score: Math.round(cosine * 10000) / 10000,
        shared_creator_count: shared,
      });
    }
  }

  // Creator-creator cosine — same shape
  const creatorRows: Array<{
    creator_a_id: string; creator_b_id: string;
    cosine_score: number; shared_brand_count: number;
  }> = [];
  const creators = [...creatorToBrands.keys()];
  for (let i = 0; i < creators.length; i++) {
    for (let j = i + 1; j < creators.length; j++) {
      const a = creators[i], b = creators[j];
      const [aId, bId] = a < b ? [a, b] : [b, a];
      const setA = creatorToBrands.get(a)!;
      const setB = creatorToBrands.get(b)!;
      const shared = [...setA].filter(x => setB.has(x)).length;
      if (shared === 0) continue;
      const cosine = shared / Math.sqrt(setA.size * setB.size);
      creatorRows.push({
        creator_a_id: aId, creator_b_id: bId,
        cosine_score: Math.round(cosine * 10000) / 10000,
        shared_brand_count: shared,
      });
    }
  }

  // Wipe + rewrite. Truncate via DELETE since RLS lets service_role do it.
  await supabase.from("brand_brand_similarity").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("creator_creator_substitutability").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  if (brandRows.length > 0) {
    // Insert in batches of 500 to stay under PostgREST limits
    for (let i = 0; i < brandRows.length; i += 500) {
      const batch = brandRows.slice(i, i + 500);
      const { error } = await supabase.from("brand_brand_similarity").insert(batch);
      if (error) console.error(`brand_brand_similarity batch ${i}: ${error.message}`);
    }
  }
  if (creatorRows.length > 0) {
    for (let i = 0; i < creatorRows.length; i += 500) {
      const batch = creatorRows.slice(i, i + 500);
      const { error } = await supabase.from("creator_creator_substitutability").insert(batch);
      if (error) console.error(`creator_creator_substitutability batch ${i}: ${error.message}`);
    }
  }

  return {
    brandPairs: brandRows.length,
    creatorPairs: creatorRows.length,
    deals: dealCount,
  };
}
