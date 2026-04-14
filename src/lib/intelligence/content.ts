/**
 * Content Intelligence — Layer 1.
 * Analyzes newsletter issues from signed-up creators via Haiku.
 * Accumulates structured intelligence in newsletter_profiles.content_intelligence.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase";
import { embedCreatorProfile } from "./embeddings";

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  return _anthropic;
}

const EXTRACTION_PROMPT = `You are analyzing a newsletter issue to build a creator intelligence profile for Stroby's matching engine. Extract structured data that helps match this creator with the RIGHT brand sponsors.

Be SPECIFIC. "Business" is useless. "Bootstrapped SaaS growth tactics for solo founders making $10k-$100k MRR" is gold.

Return STRICT JSON:
{
  "topics": ["topic 1", "topic 2", "topic 3"],
  "audience_signals": {
    "likely_profession": "e.g. product managers, indie hackers, marketing directors",
    "likely_seniority": "e.g. mid-career, senior, executive, early-career",
    "likely_interests": ["interest 1", "interest 2"],
    "likely_income_bracket": "e.g. $80k-$150k, $150k+, unknown"
  },
  "writing_style": "casual | formal | technical | conversational | edgy | academic",
  "advertiser_friendliness": 7,
  "sponsor_mentions": ["brand names already mentioned or sponsoring"],
  "content_category": "specific category — NOT generic. e.g. 'indie game dev' not 'gaming'",
  "audience_intent": "learning | entertainment | professional_development | news | lifestyle | opinion",
  "key_themes": ["recurring theme 1", "theme 2"],
  "notable_quotes": ["one short quote that reveals the creator's voice"]
}

Return ONLY the JSON. No markdown, no explanation.`;

export async function analyzeIssue(
  issueText: string,
  creatorName: string = ""
): Promise<Record<string, unknown> | null> {
  if (!issueText || issueText.trim().length < 100) return null;

  const text = issueText.slice(0, 6000);
  const anthropic = getAnthropic();

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      system: EXTRACTION_PROMPT,
      messages: [{ role: "user", content: `Creator: ${creatorName}\n\nNewsletter issue:\n\n${text}` }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "";
    try {
      return JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    }
  } catch (e) {
    console.error("Content intelligence: Haiku extraction failed:", e);
  }
  return null;
}

export async function isSignedUpCreator(
  senderEmail: string,
  publicationUrl: string = ""
): Promise<Record<string, unknown> | null> {
  const supabase = createServiceClient();

  if (senderEmail) {
    const { data } = await supabase
      .from("newsletter_profiles")
      .select("id, newsletter_name, email, url, content_intelligence")
      .eq("email", senderEmail)
      .eq("is_active", true)
      .maybeSingle();
    if (data) return data;
  }

  if (publicationUrl) {
    const { data } = await supabase
      .from("newsletter_profiles")
      .select("id, newsletter_name, email, url, content_intelligence")
      .eq("url", publicationUrl)
      .eq("is_active", true)
      .maybeSingle();
    if (data) return data;
  }

  return null;
}

function synthesizeProfile(analyses: Record<string, unknown>[]): Record<string, unknown> {
  if (!analyses.length) return {};

  // Topic frequency
  const topicCounts: Record<string, number> = {};
  for (const a of analyses) {
    for (const t of (a.topics as string[]) || []) {
      topicCounts[t] = (topicCounts[t] || 0) + 1;
    }
  }
  const topTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t);

  // Most common audience signals
  const professions = analyses.map(a => (a.audience_signals as Record<string, unknown>)?.likely_profession).filter(Boolean) as string[];
  const seniorities = analyses.map(a => (a.audience_signals as Record<string, unknown>)?.likely_seniority).filter(Boolean) as string[];
  const interests: string[] = [];
  for (const a of analyses) {
    interests.push(...((a.audience_signals as Record<string, unknown>)?.likely_interests as string[] || []));
  }

  const mostCommon = (arr: string[]) => {
    const counts: Record<string, number> = {};
    for (const v of arr) if (v) counts[v] = (counts[v] || 0) + 1;
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || null;
  };

  const topInterests = [...new Set(interests)].slice(0, 5);
  const styles = analyses.map(a => a.writing_style as string).filter(Boolean);
  const style = mostCommon(styles) || "unknown";

  const afScores = analyses
    .map(a => a.advertiser_friendliness as number)
    .filter(v => typeof v === "number");
  const avgAf = afScores.length ? Math.round((afScores.reduce((a, b) => a + b, 0) / afScores.length) * 10) / 10 : 5;

  const sponsors = new Set<string>();
  for (const a of analyses) {
    for (const s of (a.sponsor_mentions as string[]) || []) sponsors.add(s);
  }

  const categories = analyses.map(a => a.content_category as string).filter(Boolean);
  const category = mostCommon(categories) || "unknown";

  const profession = mostCommon(professions);
  const seniority = mostCommon(seniorities);
  const oneLine = `${seniority || ""} ${profession || "readers"} interested in ${topTopics.slice(0, 3).join(", ")}`.trim();

  return {
    top_topics: topTopics,
    audience_profile: {
      likely_profession: profession,
      likely_seniority: seniority,
      top_interests: topInterests,
    },
    writing_style: style,
    advertiser_friendliness: avgAf,
    existing_sponsors: [...sponsors],
    content_category: category,
    one_line_profile: oneLine,
  };
}

export async function updateCreatorIntelligence(
  creatorId: string,
  newAnalysis: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const supabase = createServiceClient();

  const { data: row } = await supabase
    .from("newsletter_profiles")
    .select("content_intelligence")
    .eq("id", creatorId)
    .single();

  let current: Record<string, unknown> = {};
  if (row?.content_intelligence) {
    current = typeof row.content_intelligence === "string"
      ? JSON.parse(row.content_intelligence)
      : row.content_intelligence as Record<string, unknown>;
  }

  const analyses = ((current.issue_analyses as Record<string, unknown>[]) || []);
  (newAnalysis as Record<string, unknown>).analyzed_at = new Date().toISOString();
  analyses.push(newAnalysis);
  const trimmed = analyses.slice(-20);

  const synthesized = synthesizeProfile(trimmed);

  const intelligence = {
    issue_analyses: trimmed,
    synthesized,
    issues_analyzed: trimmed.length,
    last_analyzed_at: new Date().toISOString(),
  };

  await supabase
    .from("newsletter_profiles")
    .update({ content_intelligence: intelligence })
    .eq("id", creatorId);

  // Auto re-embed
  try {
    await embedCreatorProfile(creatorId, intelligence);
  } catch (e) {
    console.error("Content intelligence: re-embed failed:", e);
  }

  return intelligence;
}

export async function processIncomingIssue(
  senderEmail: string,
  issueText: string,
  publicationUrl: string = ""
): Promise<Record<string, unknown> | null> {
  const creator = await isSignedUpCreator(senderEmail, publicationUrl);
  if (!creator) return null;

  const creatorName = (creator.newsletter_name as string) || "";
  const analysis = await analyzeIssue(issueText, creatorName);
  if (!analysis) return null;

  return updateCreatorIntelligence(creator.id as string, analysis);
}
