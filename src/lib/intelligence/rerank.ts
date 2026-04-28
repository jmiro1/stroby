/**
 * LLM re-ranker — applies a Sonnet pass on top of the numerical score.
 *
 * The numerical scoreMatch ranks reasonably but is fundamentally a hand-tuned
 * weighted average. With access to creator content_intelligence + brand
 * brand_intelligence, an LLM can spot non-obvious wins ("creator covers
 * exactly your customer's pain point even though embeddings don't reflect it
 * because their issues are recent") and non-obvious losses ("perfect numbers
 * but creator's tone is sarcastic toward enterprise SaaS — your brand voice
 * clashes hard").
 *
 * Strategy: take top N candidates from numerical scoring, feed to Sonnet
 * with the brand context, and ask for a re-ranked list with one-line
 * reasoning per creator. Final score = numerical_score * 0.7 + llm_position * 0.3.
 *
 * Cost: ~$0.01-0.05 per call (Sonnet at low max_tokens). Per-brand request
 * budget is fine; we don't re-rank inside the matcher loop.
 */
import Anthropic from "@anthropic-ai/sdk";

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  return _anthropic;
}

// Match the project's existing model pattern. Haiku handles ranking
// well at 1/3 the cost and ~5× the speed of Sonnet — re-ranking is a
// structured-output task, not a generation task.
const RERANK_MODEL = "claude-haiku-4-5-20251001";
const RERANK_TOP_N = 50;       // numerical → top 50 → re-rank → top N (caller decides)
const RERANK_MAX_TOKENS = 2000;

export interface RerankCandidate {
  creator_id: string;
  creator_name: string;
  numerical_score: number;
  components: Record<string, number>;
  // Compact creator context (built by getMatchesForBrand)
  creator_summary: string; // niche, audience, vibe, charge flags
}

export interface RerankResult {
  ranked: Array<{
    creator_id: string;
    llm_position: number;       // 1 = best
    llm_reasoning: string;      // one short sentence
    final_score: number;        // numerical * 0.7 + (1 - (pos-1)/N) * 0.3
  }>;
  used_llm: boolean;             // false if API key missing or call failed
  error?: string;
}

const RERANK_SYSTEM_PROMPT = `You are Stroby's matchmaking advisor. A brand is looking for newsletter creators to sponsor. The numerical engine has already shortlisted candidates by audience fit, embedding similarity, engagement, price, and brand safety. Your job: rank the top candidates by ACTUAL likelihood the brand pays this creator, accounting for things the numerical engine misses — tonal fit, audience resonance with the specific product, recency of relevant content, and the gut-feel of "would the brand's marketing lead say yes."

Return STRICT JSON with this shape:
{
  "ranking": [
    {"creator_id": "<uuid>", "reasoning": "<one short sentence — concrete, not generic>"},
    ...
  ]
}

Rules:
- Order by likelihood-of-paid-deal, best first.
- Include EVERY candidate exactly once.
- Reasoning under 120 chars per creator. Reference specifics — the creator's niche, audience, content style, or a tonal note about brand fit. NEVER write "good fit" or "great match" — those are useless.
- If a candidate is a poor fit despite high numerical score, demote and explain why concretely.
- Output the JSON object only. No prose before or after.`;

function buildUserPrompt(brand: Record<string, unknown>, brandIntel: Record<string, unknown>, candidates: RerankCandidate[]): string {
  const brandSynth = (brandIntel.synthesized as Record<string, unknown>) || brandIntel;
  const lines: string[] = [];
  lines.push(`# Brand: ${brand.company_name || "(unnamed)"}`);
  if (brandSynth.product_category) lines.push(`Product: ${brandSynth.product_category}`);
  if (brandSynth.audience_they_want || brandSynth.ideal_audience) lines.push(`Audience: ${brandSynth.audience_they_want || brandSynth.ideal_audience}`);
  if (brandSynth.brand_voice) lines.push(`Voice: ${brandSynth.brand_voice}`);
  if (brand.budget_range) lines.push(`Budget: ${brand.budget_range}`);
  if (brand.campaign_outcome) lines.push(`Goal: ${brand.campaign_outcome}`);
  if (brandSynth.competitors) lines.push(`Competitors: ${(brandSynth.competitors as string[]).join(", ")}`);
  lines.push(`\n# Candidates (${candidates.length}, already shortlisted by the numerical engine)\n`);
  candidates.forEach((c, i) => {
    lines.push(`${i + 1}. ${c.creator_id}`);
    lines.push(`   Name: ${c.creator_name}`);
    lines.push(`   Numerical score: ${(c.numerical_score * 100).toFixed(1)}%`);
    if (c.creator_summary) lines.push(`   ${c.creator_summary}`);
  });
  return lines.join("\n");
}

export async function rerankCandidates(
  brand: Record<string, unknown>,
  brandIntel: Record<string, unknown>,
  candidates: RerankCandidate[],
  topN: number = 20
): Promise<RerankResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      used_llm: false,
      error: "ANTHROPIC_API_KEY not set; falling back to numerical ordering",
      ranked: candidates.slice(0, topN).map((c, i) => ({
        creator_id: c.creator_id,
        llm_position: i + 1,
        llm_reasoning: "(LLM rerank unavailable — numerical order)",
        final_score: c.numerical_score,
      })),
    };
  }

  const shortlist = candidates.slice(0, RERANK_TOP_N);
  if (shortlist.length === 0) return { used_llm: false, ranked: [] };

  const userPrompt = buildUserPrompt(brand, brandIntel, shortlist);

  let parsed: { ranking?: Array<{ creator_id: string; reasoning: string }> } | null = null;
  try {
    const anthropic = getAnthropic();
    const response = await anthropic.messages.create({
      model: RERANK_MODEL,
      max_tokens: RERANK_MAX_TOKENS,
      system: RERANK_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }
  } catch (e) {
    return {
      used_llm: false,
      error: e instanceof Error ? e.message.slice(0, 200) : "rerank_call_failed",
      ranked: shortlist.slice(0, topN).map((c, i) => ({
        creator_id: c.creator_id,
        llm_position: i + 1,
        llm_reasoning: "(LLM rerank failed — numerical order)",
        final_score: c.numerical_score,
      })),
    };
  }

  if (!parsed?.ranking || !Array.isArray(parsed.ranking) || parsed.ranking.length === 0) {
    return {
      used_llm: false,
      error: "rerank returned no ranking",
      ranked: shortlist.slice(0, topN).map((c, i) => ({
        creator_id: c.creator_id,
        llm_position: i + 1,
        llm_reasoning: "(rerank returned empty)",
        final_score: c.numerical_score,
      })),
    };
  }

  // Build ID → numerical lookup
  const numericalById = new Map(shortlist.map(c => [c.creator_id, c.numerical_score]));

  // Apply blend: 70% numerical + 30% LLM rank position
  const total = parsed.ranking.length;
  const ranked = parsed.ranking
    .filter(r => numericalById.has(r.creator_id))
    .map((r, i) => {
      const llmRank = (1 - i / Math.max(total - 1, 1)); // 1.0 at top, 0.0 at bottom
      const numerical = numericalById.get(r.creator_id) ?? 0;
      return {
        creator_id: r.creator_id,
        llm_position: i + 1,
        llm_reasoning: (r.reasoning || "").slice(0, 200),
        final_score: numerical * 0.7 + llmRank * 0.3,
      };
    })
    .sort((a, b) => b.final_score - a.final_score)
    .slice(0, topN);

  return { used_llm: true, ranked };
}
