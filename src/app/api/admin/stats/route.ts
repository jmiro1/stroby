import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  // Simple auth — use CRON_SECRET as admin password
  const auth = request.headers.get("authorization");
  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  const secret = process.env.CRON_SECRET;
  if (!secret || (auth !== `Bearer ${secret}` && key !== secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // User counts
  const [
    { count: newsletters },
    { count: businesses },
    { count: others },
  ] = await Promise.all([
    supabase.from("newsletter_profiles").select("id", { count: "exact", head: true }),
    supabase.from("business_profiles").select("id", { count: "exact", head: true }),
    supabase.from("other_profiles").select("id", { count: "exact", head: true }),
  ]);

  // Verification breakdown
  const { data: verificationData } = await supabase
    .from("newsletter_profiles")
    .select("verification_status");

  const verification: Record<string, number> = {};
  for (const row of verificationData || []) {
    const status = (row.verification_status as string) || "unverified";
    verification[status] = (verification[status] || 0) + 1;
  }

  // Introduction stats
  const { data: introData } = await supabase
    .from("introductions")
    .select("status");

  const introStats: Record<string, number> = {};
  for (const row of introData || []) {
    const status = row.status as string;
    introStats[status] = (introStats[status] || 0) + 1;
  }

  // Messages today
  const today = new Date().toISOString().split("T")[0];
  const { count: messagesInToday } = await supabase
    .from("agent_messages")
    .select("id", { count: "exact", head: true })
    .eq("direction", "inbound")
    .gte("created_at", `${today}T00:00:00Z`);

  const { count: messagesOutToday } = await supabase
    .from("agent_messages")
    .select("id", { count: "exact", head: true })
    .eq("direction", "outbound")
    .gte("created_at", `${today}T00:00:00Z`);

  // Flagged messages (unreviewed)
  const { count: flaggedCount } = await supabase
    .from("flagged_messages")
    .select("id", { count: "exact", head: true })
    .eq("reviewed", false);

  // Flagged messages detail
  const { data: flaggedMessages } = await supabase
    .from("flagged_messages")
    .select("phone, content, flag_reason, created_at")
    .eq("reviewed", false)
    .order("created_at", { ascending: false })
    .limit(10);

  // Recent signups (last 7 days)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { data: recentNewsletters } = await supabase
    .from("newsletter_profiles")
    .select("newsletter_name, primary_niche, subscriber_count, created_at, verification_status")
    .gte("created_at", weekAgo.toISOString())
    .order("created_at", { ascending: false });

  const { data: recentBusinesses } = await supabase
    .from("business_profiles")
    .select("company_name, primary_niche, budget_range, created_at")
    .gte("created_at", weekAgo.toISOString())
    .order("created_at", { ascending: false });

  // Niche distribution
  const { data: bizNiches } = await supabase
    .from("business_profiles")
    .select("primary_niche");
  const nicheCount: Record<string, number> = {};
  for (const row of bizNiches || []) {
    const niche = (row.primary_niche as string) || "Unknown";
    nicheCount[niche] = (nicheCount[niche] || 0) + 1;
  }

  return Response.json({
    users: {
      newsletters: newsletters || 0,
      businesses: businesses || 0,
      others: others || 0,
      total: (newsletters || 0) + (businesses || 0) + (others || 0),
    },
    verification,
    introductions: introStats,
    messages_today: {
      inbound: messagesInToday || 0,
      outbound: messagesOutToday || 0,
    },
    flagged: {
      unreviewed: flaggedCount || 0,
      recent: flaggedMessages || [],
    },
    recent_signups: {
      newsletters: recentNewsletters || [],
      businesses: recentBusinesses || [],
    },
    niches: nicheCount,
    generated_at: new Date().toISOString(),
  });
}
