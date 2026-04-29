import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthed } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  if (!isAdminAuthed(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // ── Weekly signup counts (last 12 weeks) ──
  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);
  const cutoff = twelveWeeksAgo.toISOString();

  const [{ data: creators }, { data: brands }] = await Promise.all([
    supabase
      .from("newsletter_profiles")
      .select("created_at")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: true }),
    supabase
      .from("business_profiles")
      .select("created_at")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: true }),
  ]);

  // Bucket by ISO week (Mon-Sun)
  function getWeekStart(dateStr: string): string {
    const d = new Date(dateStr);
    const day = d.getUTCDay();
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // Monday
    const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff));
    return monday.toISOString().split("T")[0];
  }

  // Build a list of the last 12 week starts
  const weekStarts: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    weekStarts.push(getWeekStart(d.toISOString()));
  }
  // Deduplicate and sort
  const uniqueWeeks = [...new Set(weekStarts)].sort();

  const weeklyCreators: Record<string, number> = {};
  const weeklyBrands: Record<string, number> = {};
  for (const w of uniqueWeeks) {
    weeklyCreators[w] = 0;
    weeklyBrands[w] = 0;
  }

  for (const row of creators || []) {
    const week = getWeekStart(row.created_at);
    if (weeklyCreators[week] !== undefined) weeklyCreators[week]++;
  }
  for (const row of brands || []) {
    const week = getWeekStart(row.created_at);
    if (weeklyBrands[week] !== undefined) weeklyBrands[week]++;
  }

  // Build cumulative totals
  // First get total counts BEFORE the 12-week window
  const [{ count: creatorsBeforeWindow }, { count: brandsBeforeWindow }] = await Promise.all([
    supabase
      .from("newsletter_profiles")
      .select("id", { count: "exact", head: true })
      .lt("created_at", cutoff),
    supabase
      .from("business_profiles")
      .select("id", { count: "exact", head: true })
      .lt("created_at", cutoff),
  ]);

  let cumulativeCreators = creatorsBeforeWindow || 0;
  let cumulativeBrands = brandsBeforeWindow || 0;

  const weeklyData = uniqueWeeks.map((week) => {
    cumulativeCreators += weeklyCreators[week];
    cumulativeBrands += weeklyBrands[week];
    // Format week label as "Apr 7"
    const d = new Date(week + "T00:00:00Z");
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return {
      week,
      label,
      new_creators: weeklyCreators[week],
      new_brands: weeklyBrands[week],
      total_creators: cumulativeCreators,
      total_brands: cumulativeBrands,
    };
  });

  // ── Stickiness: how often do users come back? ──
  // Count messages per user in the last 30 days, grouped by day
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: messageActivity } = await supabase
    .from("agent_messages")
    .select("user_id, user_type, created_at")
    .eq("direction", "inbound")
    .not("user_id", "is", null)
    .gte("created_at", thirtyDaysAgo.toISOString())
    .order("created_at", { ascending: true });

  // For each user, count unique days they sent a message
  const userDays: Record<string, Set<string>> = {};
  const userTypes: Record<string, string> = {};

  for (const row of messageActivity || []) {
    const uid = row.user_id as string;
    const day = (row.created_at as string).split("T")[0];
    if (!userDays[uid]) userDays[uid] = new Set();
    userDays[uid].add(day);
    userTypes[uid] = row.user_type as string;
  }

  // Categorize users by return frequency
  const stickiness = {
    one_time: 0,      // 1 day
    returning: 0,     // 2-3 days
    engaged: 0,       // 4-7 days
    power_user: 0,    // 8+ days
  };

  const stickinessDetails: {
    user_id: string;
    user_type: string;
    active_days: number;
    last_active: string;
  }[] = [];

  for (const [uid, days] of Object.entries(userDays)) {
    const count = days.size;
    if (count === 1) stickiness.one_time++;
    else if (count <= 3) stickiness.returning++;
    else if (count <= 7) stickiness.engaged++;
    else stickiness.power_user++;

    stickinessDetails.push({
      user_id: uid,
      user_type: userTypes[uid] || "unknown",
      active_days: count,
      last_active: [...days].sort().pop() || "",
    });
  }

  // Sort by active_days descending (most engaged first)
  stickinessDetails.sort((a, b) => b.active_days - a.active_days);

  // Daily active users (last 30 days) for a DAU chart
  const dailyActive: Record<string, { creators: Set<string>; brands: Set<string> }> = {};
  for (const row of messageActivity || []) {
    const day = (row.created_at as string).split("T")[0];
    if (!dailyActive[day]) dailyActive[day] = { creators: new Set(), brands: new Set() };
    const uid = row.user_id as string;
    if (row.user_type === "newsletter") dailyActive[day].creators.add(uid);
    else if (row.user_type === "business") dailyActive[day].brands.add(uid);
  }

  // Fill in missing days
  const dauData: { date: string; label: string; creators: number; brands: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const day = d.toISOString().split("T")[0];
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const entry = dailyActive[day];
    dauData.push({
      date: day,
      label,
      creators: entry?.creators.size || 0,
      brands: entry?.brands.size || 0,
    });
  }

  return Response.json({
    weekly_growth: weeklyData,
    stickiness,
    stickiness_top_users: stickinessDetails.slice(0, 20),
    daily_active_users: dauData,
    total_active_users_30d: Object.keys(userDays).length,
    generated_at: new Date().toISOString(),
  });
}
