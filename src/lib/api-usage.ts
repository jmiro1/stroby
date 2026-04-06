import { createServiceClient } from "./supabase";

// Pricing per model (USD per 1M tokens or per 1K chars)
const PRICING = {
  "claude-haiku-4-5-20251001": { in: 1.0 / 1_000_000, out: 5.0 / 1_000_000 },
  "claude-sonnet-4-20250514": { in: 3.0 / 1_000_000, out: 15.0 / 1_000_000 },
  "tts-1": { in: 15.0 / 1_000_000 }, // $0.015 per 1k chars
};

interface UsageLog {
  provider: "anthropic" | "openai" | "meta";
  model: string;
  route: string;
  tokensIn?: number;
  tokensOut?: number;
  charCount?: number; // For TTS
}

// Fire-and-forget logging — never blocks the main flow
export function logApiUsage(log: UsageLog): void {
  const tokensIn = log.tokensIn || log.charCount || 0;
  const tokensOut = log.tokensOut || 0;

  const pricing = PRICING[log.model as keyof typeof PRICING];
  let cost = 0;
  if (pricing) {
    cost = tokensIn * pricing.in;
    if ("out" in pricing) cost += tokensOut * pricing.out;
  }

  // Async fire-and-forget
  (async () => {
    try {
      const supabase = createServiceClient();
      await supabase.from("api_usage").insert({
        provider: log.provider,
        model: log.model,
        route: log.route,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost_estimate: cost,
      });
    } catch {
      // Silent — never block
    }
  })();
}

// Aggregate cost data for the dashboard
export async function getCostSummary() {
  const supabase = createServiceClient();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [today, week, month] = await Promise.all([
    supabase.from("api_usage").select("cost_estimate, tokens_in, tokens_out, provider, route").gte("created_at", todayStart),
    supabase.from("api_usage").select("cost_estimate, provider, route").gte("created_at", weekAgo),
    supabase.from("api_usage").select("cost_estimate, provider, route").gte("created_at", monthStart),
  ]);

  const sumCost = (rows: Array<{ cost_estimate: number }> | null) =>
    (rows || []).reduce((a, r) => a + Number(r.cost_estimate || 0), 0);

  const byProvider: Record<string, number> = {};
  const byRoute: Record<string, number> = {};

  for (const row of today.data || []) {
    byProvider[row.provider] = (byProvider[row.provider] || 0) + Number(row.cost_estimate || 0);
    byRoute[row.route] = (byRoute[row.route] || 0) + Number(row.cost_estimate || 0);
  }

  const tokensInToday = (today.data || []).reduce((a, r) => a + (r.tokens_in || 0), 0);
  const tokensOutToday = (today.data || []).reduce((a, r) => a + (r.tokens_out || 0), 0);

  // Daily trend for last 30 days
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: trend } = await supabase
    .from("api_usage")
    .select("cost_estimate, created_at")
    .gte("created_at", thirtyDaysAgo);

  const dailyTrend: Record<string, number> = {};
  for (const row of trend || []) {
    const date = new Date(row.created_at as string).toISOString().split("T")[0];
    dailyTrend[date] = (dailyTrend[date] || 0) + Number(row.cost_estimate || 0);
  }

  return {
    today: { cost: sumCost(today.data), tokensIn: tokensInToday, tokensOut: tokensOutToday },
    week: { cost: sumCost(week.data) },
    month: { cost: sumCost(month.data) },
    byProvider,
    byRoute,
    dailyTrend,
  };
}
