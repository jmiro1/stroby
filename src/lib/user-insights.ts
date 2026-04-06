import { createServiceClient } from "./supabase";

// Event types that trigger insight updates
type InsightEvent =
  | { type: "match_suggested"; niche: string; score: number }
  | { type: "match_accepted"; niche: string; score: number }
  | { type: "match_declined"; niche: string; score: number }
  | { type: "rating_given"; rating: number }
  | { type: "intro_made"; partnerNiche: string }
  | { type: "message_sent" };

interface UserInsights {
  matches_suggested: number;
  matches_accepted: number;
  matches_declined: number;
  avg_accepted_score: number;
  avg_declined_score: number;
  declined_niches: Record<string, number>; // niche → count
  accepted_niches: Record<string, number>;
  ratings_given: number[];
  active_since: string;
  last_active: string;
  total_messages: number;
}

function defaultInsights(): UserInsights {
  return {
    matches_suggested: 0,
    matches_accepted: 0,
    matches_declined: 0,
    avg_accepted_score: 0,
    avg_declined_score: 0,
    declined_niches: {},
    accepted_niches: {},
    ratings_given: [],
    active_since: new Date().toISOString().split("T")[0],
    last_active: new Date().toISOString().split("T")[0],
    total_messages: 0,
  };
}

// Update user insights based on an event
export async function updateUserInsights(
  userId: string,
  userType: "newsletter" | "business" | "other",
  event: InsightEvent
) {
  const supabase = createServiceClient();
  const table =
    userType === "newsletter" ? "newsletter_profiles"
    : userType === "business" ? "business_profiles"
    : "other_profiles";

  // Fetch current preferences
  const { data } = await supabase
    .from(table)
    .select("preferences")
    .eq("id", userId)
    .single();

  const insights: UserInsights = {
    ...defaultInsights(),
    ...((data?.preferences as unknown as Partial<UserInsights>) || {}),
  };

  insights.last_active = new Date().toISOString().split("T")[0];

  switch (event.type) {
    case "match_suggested":
      insights.matches_suggested++;
      break;

    case "match_accepted":
      insights.matches_accepted++;
      insights.accepted_niches[event.niche] = (insights.accepted_niches[event.niche] || 0) + 1;
      // Running average of accepted scores
      insights.avg_accepted_score =
        ((insights.avg_accepted_score * (insights.matches_accepted - 1)) + event.score) /
        insights.matches_accepted;
      break;

    case "match_declined":
      insights.matches_declined++;
      insights.declined_niches[event.niche] = (insights.declined_niches[event.niche] || 0) + 1;
      insights.avg_declined_score =
        ((insights.avg_declined_score * (insights.matches_declined - 1)) + event.score) /
        insights.matches_declined;
      break;

    case "rating_given":
      insights.ratings_given.push(event.rating);
      // Keep only last 10 ratings
      if (insights.ratings_given.length > 10) {
        insights.ratings_given = insights.ratings_given.slice(-10);
      }
      break;

    case "intro_made":
      // Just track — the niche pair info is valuable
      break;

    case "message_sent":
      insights.total_messages++;
      break;
  }

  await supabase
    .from(table)
    .update({ preferences: insights })
    .eq("id", userId);
}

// Compute platform-wide stats (called from daily cron)
export async function computePlatformStats(): Promise<Record<string, unknown>> {
  const supabase = createServiceClient();

  const [{ count: totalNewsletters }, { count: totalBusinesses }, { count: totalOther }] = await Promise.all([
    supabase.from("newsletter_profiles").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("business_profiles").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("other_profiles").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);

  // Count businesses per niche
  const { data: bizNiches } = await supabase
    .from("business_profiles")
    .select("primary_niche")
    .eq("is_active", true);

  const nicheCounts: Record<string, number> = {};
  for (const biz of bizNiches || []) {
    const niche = biz.primary_niche as string;
    if (niche) nicheCounts[niche] = (nicheCounts[niche] || 0) + 1;
  }

  // Match acceptance rate
  const { count: totalIntros } = await supabase
    .from("introductions")
    .select("id", { count: "exact", head: true });
  const { count: acceptedIntros } = await supabase
    .from("introductions")
    .select("id", { count: "exact", head: true })
    .in("status", ["introduced", "newsletter_accepted", "business_accepted", "completed"]);

  return {
    total_creators: (totalNewsletters || 0) + (totalOther || 0),
    total_businesses: totalBusinesses || 0,
    businesses_by_niche: nicheCounts,
    match_acceptance_rate: totalIntros ? ((acceptedIntros || 0) / totalIntros) : 0,
    computed_at: new Date().toISOString(),
  };
}

// Format insights for AI context (keeps it concise)
export function formatInsightsForAI(preferences: Record<string, unknown> | null): string {
  if (!preferences) return "";

  const p = preferences as unknown as UserInsights;
  const parts: string[] = [];

  if (p.active_since) parts.push(`Member since: ${p.active_since}`);

  const suggested = p.matches_suggested || 0;
  const accepted = p.matches_accepted || 0;
  const declined = p.matches_declined || 0;
  if (suggested > 0) {
    parts.push(`Match history: ${suggested} suggested, ${accepted} accepted, ${declined} declined`);
  }

  // Peer comparison stats (cached weekly)
  const peerStats = (preferences as Record<string, unknown>).peer_stats as Record<string, unknown> | undefined;
  if (peerStats) {
    if (peerStats.completeness_percentile != null) {
      parts.push(`Profile completeness: top ${100 - Number(peerStats.completeness_percentile)}% in niche`);
    }
    if (peerStats.acceptance_rate_percentile != null && (p.matches_suggested || 0) >= 3) {
      parts.push(`Match acceptance: top ${100 - Number(peerStats.acceptance_rate_percentile)}% in niche`);
    }
  }

  // Declined niches (if pattern emerges)
  if (p.declined_niches) {
    const frequentDeclines = Object.entries(p.declined_niches)
      .filter(([, count]) => count >= 2)
      .map(([niche]) => niche);
    if (frequentDeclines.length > 0) {
      parts.push(`Frequently declined niches: ${frequentDeclines.join(", ")}`);
    }
  }

  // Average ratings
  if (p.ratings_given && p.ratings_given.length > 0) {
    const avg = p.ratings_given.reduce((a, b) => a + b, 0) / p.ratings_given.length;
    parts.push(`Avg satisfaction: ${avg.toFixed(1)}/5`);
  }

  return parts.length > 0 ? "\n" + parts.join("\n") : "";
}

export function formatPlatformStatsForAI(stats: Record<string, unknown> | null, userNiche: string | null): string {
  if (!stats) return "";

  const parts: string[] = [];
  parts.push(`Platform: ${stats.total_creators} creators, ${stats.total_businesses} businesses`);

  if (userNiche && stats.businesses_by_niche) {
    const nicheBiz = (stats.businesses_by_niche as Record<string, number>)[userNiche];
    if (nicheBiz) {
      parts.push(`${nicheBiz} ${nicheBiz === 1 ? "business" : "businesses"} currently looking in ${userNiche}`);
    }
  }

  return "\n" + parts.join("\n");
}
