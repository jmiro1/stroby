import { createServiceClient } from "@/lib/supabase";

export const revalidate = 30; // Cache for 30 seconds

interface ActivityEvent {
  type: "creator_joined" | "brand_joined" | "match_suggested" | "introduction_made" | "deal_completed";
  niche: string;
  timestamp: string;
}

export async function GET() {
  const supabase = createServiceClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const events: ActivityEvent[] = [];

  // New creators
  const { data: newCreators } = await supabase
    .from("newsletter_profiles")
    .select("primary_niche, created_at")
    .gte("created_at", sevenDaysAgo)
    .order("created_at", { ascending: false })
    .limit(10);

  for (const c of newCreators || []) {
    events.push({
      type: "creator_joined",
      niche: (c.primary_niche as string) || "General",
      timestamp: c.created_at as string,
    });
  }

  // New creators from other_profiles
  const { data: newOther } = await supabase
    .from("other_profiles")
    .select("niche, created_at")
    .gte("created_at", sevenDaysAgo)
    .order("created_at", { ascending: false })
    .limit(10);

  for (const c of newOther || []) {
    events.push({
      type: "creator_joined",
      niche: (c.niche as string) || "General",
      timestamp: c.created_at as string,
    });
  }

  // New brands
  const { data: newBrands } = await supabase
    .from("business_profiles")
    .select("primary_niche, created_at")
    .gte("created_at", sevenDaysAgo)
    .order("created_at", { ascending: false })
    .limit(10);

  for (const b of newBrands || []) {
    events.push({
      type: "brand_joined",
      niche: (b.primary_niche as string) || "General",
      timestamp: b.created_at as string,
    });
  }

  // Matches suggested + introductions + completions
  const { data: intros } = await supabase
    .from("introductions")
    .select("status, created_at, introduced_at, business_profiles(primary_niche)")
    .gte("created_at", sevenDaysAgo)
    .order("created_at", { ascending: false })
    .limit(20);

  for (const intro of intros || []) {
    const bizProfile = intro.business_profiles as unknown as { primary_niche?: string } | null;
    const niche = bizProfile?.primary_niche || "General";

    // Match suggested
    events.push({
      type: "match_suggested",
      niche,
      timestamp: intro.created_at as string,
    });

    // Introduction made (if applicable)
    if (intro.introduced_at) {
      events.push({
        type: "introduction_made",
        niche,
        timestamp: intro.introduced_at as string,
      });
    }

    // Deal completed
    if (intro.status === "completed") {
      events.push({
        type: "deal_completed",
        niche,
        timestamp: intro.introduced_at as string || intro.created_at as string,
      });
    }
  }

  // Sort by timestamp desc, dedupe, cap at 15
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const recent = events.slice(0, 15);

  return Response.json({ events: recent, count: recent.length });
}
