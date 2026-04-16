/**
 * Shadow profile ingestion — writes scraped/enriched brand and creator
 * profiles to the product DB as shadow rows (onboarding_status='shadow').
 *
 * Callers come from the VPS leadgen sidecar (Hostinger) via POST
 * /api/shadow/ingest. Auth is service-role-equivalent (INGEST_SECRET).
 *
 * Writes go directly to *_all base tables using the service-role
 * Supabase client, which bypasses RLS. The product app only ever sees
 * these rows via the matching engine (business_directory /
 * newsletter_directory views) — never via business_profiles /
 * newsletter_profiles (which filter out shadows).
 *
 * Collision rule:
 *   - Real row with same website/URL exists → skip, return existing id
 *   - Shadow row with same website/URL exists → upsert intelligence +
 *     embedding (re-scrape might have better data)
 *   - No match → insert new shadow row
 */
import { createServiceClient } from "@/lib/supabase";
import { analyzeBrandWebsite } from "@/lib/intelligence/brand";
import { brandFingerprint, creatorFingerprint } from "@/lib/intelligence/embeddings";

const PGVECTOR_DIM = 1536;
const VOYAGE_MODEL = "voyage-3-lite";

async function embedText(text: string): Promise<number[] | null> {
  if (!text.trim()) return null;
  const apiKey = process.env.VOYAGEAI_API_KEY;
  if (!apiKey) return null;
  try {
    const resp = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input: [text], model: VOYAGE_MODEL, input_type: "document" }),
      signal: AbortSignal.timeout(30000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const emb = (data.data as { embedding: number[] }[])[0]?.embedding;
    if (!emb) return null;
    while (emb.length < PGVECTOR_DIM) emb.push(0);
    return emb;
  } catch {
    return null;
  }
}

function vecToString(vec: number[]): string {
  return "[" + vec.join(",") + "]";
}

// ────────────────────────────────────────────────────────────────────
// Brand ingestion

export interface ShadowBrandInput {
  company_name: string;
  website_url?: string | null;
  contact_name?: string | null;
  contact_role?: string | null;
  email?: string | null;
  primary_niche?: string | null;
  description?: string | null;
  brand_intelligence?: Record<string, unknown> | null; // precomputed, else we'll run analyzeBrandWebsite
  source: string; // 'yc-w25' | 'meta-adlib' | 'paved' | etc
}

export interface ShadowIngestResult {
  ok: boolean;
  id?: string;
  status?: "created" | "updated" | "skipped_real";
  error?: string;
}

export async function upsertShadowBrand(input: ShadowBrandInput): Promise<ShadowIngestResult> {
  if (!input.company_name || !input.source) {
    return { ok: false, error: "company_name and source are required" };
  }

  const supabase = createServiceClient();
  const website = (input.website_url || "").trim() || null;

  // Collision: website match
  if (website) {
    const { data: existing } = await supabase
      .from("business_directory")
      .select("id, onboarding_status")
      .ilike("description", `%${website}%`) // description holds website today
      .limit(1)
      .maybeSingle();

    if (existing) {
      if (existing.onboarding_status === "whatsapp_active" || existing.onboarding_status === "fully_onboarded") {
        return { ok: true, id: existing.id, status: "skipped_real" };
      }
      // Existing shadow: fall through, we'll update it
      return await refreshShadowBrandIntelligence(existing.id, input);
    }
  }

  // No collision: compute intelligence if not provided
  let intel = input.brand_intelligence || null;
  if (!intel && website) {
    try {
      intel = await analyzeBrandWebsite(website, input.company_name);
    } catch (e) {
      console.error("upsertShadowBrand: analyzeBrandWebsite failed:", e);
    }
  }

  // Embedding from fingerprint (fallback to free-text if no intel)
  let embedding: number[] | null = null;
  if (intel) {
    const synth = intel.synthesized ? intel : { synthesized: intel };
    const fp = brandFingerprint(synth) || `${input.company_name}. ${input.primary_niche || ""}. ${input.description || ""}`;
    if (fp) embedding = await embedText(fp);
  }

  const descCombined = website ? `Website: ${website}${input.description ? ` | ${input.description}` : ""}` : input.description || null;

  const { data, error } = await supabase
    .from("business_profiles_all")
    .insert({
      company_name: input.company_name,
      contact_name: input.contact_name || "",
      contact_role: input.contact_role || null,
      email: input.email || null,
      primary_niche: input.primary_niche || "Other",
      description: descCombined,
      onboarding_status: "shadow",
      shadow_source: input.source,
      brand_intelligence: intel,
      profile_embedding: embedding ? vecToString(embedding) : null,
      partner_preference: "all",
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id, status: "created" };
}

async function refreshShadowBrandIntelligence(
  id: string,
  input: ShadowBrandInput
): Promise<ShadowIngestResult> {
  const supabase = createServiceClient();
  const website = (input.website_url || "").trim() || null;

  let intel = input.brand_intelligence || null;
  if (!intel && website) {
    try {
      intel = await analyzeBrandWebsite(website, input.company_name);
    } catch (e) {
      console.error("refreshShadowBrandIntelligence: analyzeBrandWebsite failed:", e);
    }
  }

  let embedding: number[] | null = null;
  if (intel) {
    const synth = intel.synthesized ? intel : { synthesized: intel };
    const fp = brandFingerprint(synth);
    if (fp) embedding = await embedText(fp);
  }

  const updates: Record<string, unknown> = { shadow_source: input.source };
  if (intel) updates.brand_intelligence = intel;
  if (embedding) updates.profile_embedding = vecToString(embedding);

  const { error } = await supabase
    .from("business_profiles_all")
    .update(updates)
    .eq("id", id)
    .eq("onboarding_status", "shadow"); // race-safe — never overwrite a claimed row

  if (error) return { ok: false, error: error.message };
  return { ok: true, id, status: "updated" };
}

// ────────────────────────────────────────────────────────────────────
// Creator ingestion

export interface ShadowCreatorInput {
  newsletter_name: string;
  url?: string | null;
  owner_name?: string | null;
  platform?: string | null;
  primary_niche?: string | null;
  description?: string | null;
  subscriber_count?: number | null;
  content_intelligence?: Record<string, unknown> | null;
  source: string;
}

export async function upsertShadowCreator(input: ShadowCreatorInput): Promise<ShadowIngestResult> {
  if (!input.newsletter_name || !input.source) {
    return { ok: false, error: "newsletter_name and source are required" };
  }

  const supabase = createServiceClient();
  const url = (input.url || "").trim() || null;

  // Collision: url match
  if (url) {
    const { data: existing } = await supabase
      .from("newsletter_directory")
      .select("id, onboarding_status")
      .eq("url", url)
      .limit(1)
      .maybeSingle();

    if (existing) {
      if (existing.onboarding_status === "whatsapp_active" || existing.onboarding_status === "fully_onboarded") {
        return { ok: true, id: existing.id, status: "skipped_real" };
      }
      // Existing shadow: update content_intel if provided
      const updates: Record<string, unknown> = { shadow_source: input.source };
      if (input.content_intelligence) updates.content_intelligence = input.content_intelligence;
      if (input.subscriber_count) updates.subscriber_count = input.subscriber_count;

      let embedding: number[] | null = null;
      if (input.content_intelligence) {
        const synth = (input.content_intelligence as Record<string, unknown>).synthesized
          ? input.content_intelligence
          : { synthesized: input.content_intelligence };
        const fp = creatorFingerprint(synth);
        if (fp) embedding = await embedText(fp);
      }
      if (embedding) updates.profile_embedding = vecToString(embedding);

      const { error } = await supabase
        .from("newsletter_profiles_all")
        .update(updates)
        .eq("id", existing.id)
        .eq("onboarding_status", "shadow");
      if (error) return { ok: false, error: error.message };
      return { ok: true, id: existing.id, status: "updated" };
    }
  }

  // No collision: insert new shadow
  let embedding: number[] | null = null;
  if (input.content_intelligence) {
    const synth = (input.content_intelligence as Record<string, unknown>).synthesized
      ? input.content_intelligence
      : { synthesized: input.content_intelligence };
    const fp = creatorFingerprint(synth)
      || `${input.newsletter_name}. ${input.primary_niche || ""}. ${input.description || ""}`;
    if (fp) embedding = await embedText(fp);
  }

  const rawName = input.newsletter_name;
  const slug = rawName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    + "-shadow-"
    + Math.random().toString(36).slice(2, 6);

  const { data, error } = await supabase
    .from("newsletter_profiles_all")
    .insert({
      newsletter_name: input.newsletter_name,
      slug,
      owner_name: input.owner_name || "Creator",
      url,
      platform: input.platform || null,
      primary_niche: input.primary_niche || "Other",
      description: input.description || null,
      subscriber_count: input.subscriber_count || null,
      onboarding_status: "shadow",
      shadow_source: input.source,
      content_intelligence: input.content_intelligence || null,
      profile_embedding: embedding ? vecToString(embedding) : null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id, status: "created" };
}
