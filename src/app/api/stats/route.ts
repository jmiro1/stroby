import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const niche = searchParams.get("niche");

  const supabase = createServiceClient();

  // Total counts
  const { count: totalNewsletters } = await supabase
    .from("newsletter_profiles")
    .select("*", { count: "exact", head: true });

  const { count: totalBusinesses } = await supabase
    .from("business_profiles")
    .select("*", { count: "exact", head: true });

  // Audience reach — sum subscriber_count across newsletters
  const { data: subscriberData } = await supabase
    .from("newsletter_profiles")
    .select("subscriber_count");

  const totalAudienceReach =
    subscriberData?.reduce(
      (sum, row) => sum + (row.subscriber_count ?? 0),
      0
    ) ?? 0;

  // Niche-specific counts
  let nicheNewsletters = 0;
  let nicheBusinesses = 0;

  if (niche) {
    const { count: nn } = await supabase
      .from("newsletter_profiles")
      .select("*", { count: "exact", head: true })
      .contains("niches", [niche]);
    nicheNewsletters = nn ?? 0;

    const { count: nb } = await supabase
      .from("business_profiles")
      .select("*", { count: "exact", head: true })
      .eq("primary_niche", niche);
    nicheBusinesses = nb ?? 0;
  }

  return NextResponse.json({
    totalNewsletters: totalNewsletters ?? 0,
    totalBusinesses: totalBusinesses ?? 0,
    nicheNewsletters,
    nicheBusinesses,
    totalAudienceReach,
  });
}
