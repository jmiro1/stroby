/**
 * Brand Intelligence — Layer 2.
 * Scrapes brand websites, extracts structured profiles via Haiku.
 * Stores in business_profiles.brand_intelligence.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase";
import { validateUrl } from "./url-safety";
import { embedBrandProfile } from "./embeddings";

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  return _anthropic;
}

const BRAND_EXTRACTION_PROMPT = `You are analyzing a brand's website to build a Brand Intelligence Profile for Stroby's matching engine. Extract structured data that helps match this brand with the RIGHT newsletter creators.

CRITICAL: Focus on WHO this brand wants to reach, not just what industry they're in.
"A travel brand might want to reach finance professionals with disposable income" — think about the AUDIENCE, not the category.

Be SPECIFIC. "Business professionals" is useless. "Series B SaaS CTOs managing 20-100 person engineering teams" is gold.

Return STRICT JSON:
{
  "product_category": "specific description — NOT just 'SaaS'",
  "target_customer": {
    "profession": "e.g. engineering managers, product leads",
    "company_size": "e.g. 50-500 employees",
    "seniority": "e.g. mid-career, senior, executive",
    "pain_points": ["pain point 1", "pain point 2"],
    "income_bracket": "e.g. $80k-$150k, $150k+, unknown",
    "psychographic": "what kind of person buys this?"
  },
  "brand_voice": "professional | playful | edgy | premium | technical | minimalist",
  "competitors": ["competitor 1", "competitor 2"],
  "budget_signals": "bootstrapped | seed | series-a-b | growth | enterprise",
  "content_themes_they_align_with": ["theme 1", "theme 2", "theme 3"],
  "audience_they_want": "one-line description of their ideal newsletter reader",
  "newsletter_fit_notes": "what kind of newsletters would their ideal customer read?"
}

Return ONLY the JSON. No markdown, no explanation.`;

function htmlToText(html: string): string {
  let text = html.slice(0, 200_000);
  // Remove script/style blocks
  for (const tag of ["script", "style", "noscript"]) {
    const parts = text.split(new RegExp(`<${tag}[^>]*>`, "gi"));
    const cleaned = [parts[0]];
    for (const part of parts.slice(1)) {
      const closeIdx = part.toLowerCase().indexOf(`</${tag}>`);
      if (closeIdx >= 0) cleaned.push(part.slice(closeIdx + tag.length + 3));
    }
    text = cleaned.join("");
  }
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
  text = text.replace(/&#?\w+;/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

async function scrapeWebsite(url: string, maxPages = 3): Promise<string> {
  if (!url) return "";

  url = url.trim().replace(/\/+$/, "");
  if (!url.startsWith("http")) url = `https://${url}`;

  if (!(await validateUrl(url))) return "";

  const paths = ["", "/about", "/about-us", "/pricing", "/product", "/for-teams", "/customers"];
  const texts: string[] = [];
  let tried = 0;

  for (const path of paths) {
    if (tried >= maxPages) break;
    const pageUrl = `${url}${path}`;

    try {
      const resp = await fetch(pageUrl, {
        redirect: "manual", // No auto-follow (SSRF protection)
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) StrobyBot/1.0" },
      });

      // Handle one redirect safely
      if ([301, 302, 303, 307, 308].includes(resp.status)) {
        const loc = resp.headers.get("location");
        if (loc) {
          const redirectUrl = loc.startsWith("http") ? loc : new URL(loc, pageUrl).href;
          if (await validateUrl(redirectUrl)) {
            const rResp = await fetch(redirectUrl, {
              redirect: "manual",
              signal: AbortSignal.timeout(8000),
              headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) StrobyBot/1.0" },
            });
            if (rResp.ok && rResp.headers.get("content-type")?.startsWith("text/html")) {
              const text = htmlToText(await rResp.text());
              if (text.length > 200) { texts.push(`--- PAGE: ${redirectUrl} ---\n${text}`); tried++; }
            }
          }
        }
        continue;
      }

      if (resp.ok && resp.headers.get("content-type")?.startsWith("text/html")) {
        const text = htmlToText(await resp.text());
        if (text.length > 200) { texts.push(`--- PAGE: ${pageUrl} ---\n${text}`); tried++; }
      }
    } catch {
      continue;
    }
  }

  return texts.join("\n\n");
}

export async function analyzeBrandWebsite(
  websiteUrl: string,
  brandName: string = "",
  extraContext: string = ""
): Promise<Record<string, unknown> | null> {
  const websiteText = await scrapeWebsite(websiteUrl);
  if (!websiteText || websiteText.trim().length < 200) return null;

  const text = websiteText.slice(0, 8000);
  const anthropic = getAnthropic();

  let userPrompt = `Brand: ${brandName}\nWebsite: ${websiteUrl}\n`;
  if (extraContext) userPrompt += `Additional context: ${extraContext}\n`;
  userPrompt += `\nWebsite content:\n\n${text}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      system: BRAND_EXTRACTION_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "";
    try {
      return JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    }
  } catch (e) {
    console.error("Brand intelligence: Haiku extraction failed:", e);
  }
  return null;
}

function synthesizeBrandProfile(
  analyses: Record<string, unknown>[],
  onboarding: Record<string, unknown>
): Record<string, unknown> {
  if (!analyses.length && !Object.keys(onboarding).length) return {};

  const mostCommon = (arr: string[]) => {
    const counts: Record<string, number> = {};
    for (const v of arr) if (v) counts[v] = (counts[v] || 0) + 1;
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || null;
  };

  const productCats = analyses.map(a => a.product_category as string).filter(Boolean);
  const professions = analyses.map(a => (a.target_customer as Record<string, unknown>)?.profession as string).filter(Boolean);
  const seniorities = analyses.map(a => (a.target_customer as Record<string, unknown>)?.seniority as string).filter(Boolean);
  const companySizes = analyses.map(a => (a.target_customer as Record<string, unknown>)?.company_size as string).filter(Boolean);
  const incomes = analyses.map(a => (a.target_customer as Record<string, unknown>)?.income_bracket as string).filter(v => v && v !== "unknown");
  const psychographics = analyses.map(a => (a.target_customer as Record<string, unknown>)?.psychographic as string).filter(Boolean);

  const painPoints: string[] = [];
  const themes: string[] = [];
  const competitors: string[] = [];
  for (const a of analyses) {
    painPoints.push(...((a.target_customer as Record<string, unknown>)?.pain_points as string[] || []));
    themes.push(...(a.content_themes_they_align_with as string[] || []));
    competitors.push(...(a.competitors as string[] || []));
  }

  const voices = analyses.map(a => a.brand_voice as string).filter(Boolean);
  const budgets = analyses.map(a => a.budget_signals as string).filter(Boolean);
  const audienceDescs = analyses.map(a => a.audience_they_want as string).filter(Boolean);
  const newsletterFits = analyses.map(a => a.newsletter_fit_notes as string).filter(Boolean);

  // Merge onboarding data (higher weight)
  if (onboarding.customer_description) audienceDescs.unshift(onboarding.customer_description as string);
  if (onboarding.past_sponsors) {
    const ps = onboarding.past_sponsors as string;
    competitors.push(...ps.split(",").map(s => s.trim()).filter(Boolean));
  }

  const topThemes = [...new Set(themes)].slice(0, 8);
  const profession = mostCommon(professions);
  const seniority = mostCommon(seniorities);
  const oneLine = `Wants to reach ${seniority || ""} ${profession || "professionals"} interested in ${topThemes.slice(0, 3).join(", ")}`.trim();

  return {
    product_category: mostCommon(productCats),
    ideal_audience: audienceDescs[0] || "",
    target_profile: {
      profession,
      seniority,
      company_size: mostCommon(companySizes),
      income_bracket: mostCommon(incomes),
      psychographic: mostCommon(psychographics),
      pain_points: [...new Set(painPoints)].slice(0, 5),
    },
    content_affinity: topThemes,
    brand_voice: mostCommon(voices) || "unknown",
    budget_signal: mostCommon(budgets) || "unknown",
    competitors: [...new Set(competitors)].slice(0, 10),
    newsletter_fit: newsletterFits[0] || null,
    one_line_need: oneLine,
    // Brand preferences from onboarding (passed through for embeddings + matching)
    campaign_outcome: onboarding.campaign_outcome || null,
    preferred_creator_type: onboarding.preferred_creator_type || "any",
    preferred_creator_size: onboarding.preferred_creator_size || "any",
  };
}

export async function updateBrandIntelligence(
  brandId: string,
  newAnalysis: Record<string, unknown>,
  source: string = "website"
): Promise<Record<string, unknown>> {
  const supabase = createServiceClient();

  const { data: row } = await supabase
    .from("business_profiles")
    .select("brand_intelligence")
    .eq("id", brandId)
    .single();

  let current: Record<string, unknown> = {};
  if (row?.brand_intelligence) {
    current = typeof row.brand_intelligence === "string"
      ? JSON.parse(row.brand_intelligence)
      : row.brand_intelligence as Record<string, unknown>;
  }

  const analyses = (current.website_analyses as Record<string, unknown>[]) || [];
  newAnalysis.analyzed_at = new Date().toISOString();
  newAnalysis.source = source;
  analyses.push(newAnalysis);
  const trimmed = analyses.slice(-10);

  const onboarding = (current.onboarding_data as Record<string, unknown>) || {};
  const synthesized = synthesizeBrandProfile(trimmed, onboarding);

  const intelligence = {
    website_analyses: trimmed,
    onboarding_data: onboarding,
    synthesized,
    analyses_count: trimmed.length,
    last_analyzed_at: new Date().toISOString(),
  };

  await supabase
    .from("business_profiles")
    .update({ brand_intelligence: intelligence })
    .eq("id", brandId);

  // Auto re-embed
  try {
    await embedBrandProfile(brandId, intelligence);
  } catch (e) {
    console.error("Brand intelligence: re-embed failed:", e);
  }

  return intelligence;
}

export async function updateOnboardingData(
  brandId: string,
  answers: Record<string, string>
): Promise<Record<string, unknown>> {
  const supabase = createServiceClient();

  const { data: row } = await supabase
    .from("business_profiles")
    .select("brand_intelligence")
    .eq("id", brandId)
    .single();

  let current: Record<string, unknown> = {};
  if (row?.brand_intelligence) {
    current = typeof row.brand_intelligence === "string"
      ? JSON.parse(row.brand_intelligence)
      : row.brand_intelligence as Record<string, unknown>;
  }

  const analyses = (current.website_analyses as Record<string, unknown>[]) || [];
  const onboarding = (current.onboarding_data as Record<string, unknown>) || {};
  Object.assign(onboarding, answers, { updated_at: new Date().toISOString() });

  const synthesized = synthesizeBrandProfile(analyses, onboarding);

  const intelligence = {
    website_analyses: analyses,
    onboarding_data: onboarding,
    synthesized,
    analyses_count: analyses.length,
    last_analyzed_at: new Date().toISOString(),
  };

  await supabase
    .from("business_profiles")
    .update({ brand_intelligence: intelligence })
    .eq("id", brandId);

  try {
    await embedBrandProfile(brandId, intelligence);
  } catch (e) {
    console.error("Brand intelligence: re-embed failed:", e);
  }

  return intelligence;
}

export async function processBrand(
  brandId: string,
  websiteUrl: string = "",
  brandName: string = ""
): Promise<Record<string, unknown> | null> {
  const supabase = createServiceClient();

  if (!websiteUrl || !brandName) {
    const { data: brand } = await supabase
      .from("business_profiles")
      .select("company_name, description, product_description, primary_niche, budget_range")
      .eq("id", brandId)
      .single();

    if (!brand) return null;
    if (!brandName) brandName = brand.company_name || "";
    if (!websiteUrl) {
      // Try to find URL in description
      const urlMatch = (brand.description || "").match(/https?:\/\/[^\s]+/);
      if (urlMatch) websiteUrl = urlMatch[0];
    }
  }

  if (!websiteUrl) return null;

  const analysis = await analyzeBrandWebsite(websiteUrl, brandName);
  if (!analysis) return null;

  return updateBrandIntelligence(brandId, analysis, "website");
}
