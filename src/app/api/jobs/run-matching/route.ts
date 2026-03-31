import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { findMatchesForBusiness } from "@/lib/matching";

export async function POST(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Fetch all active businesses that are onboarded
  const { data: businesses, error } = await supabase
    .from("business_profiles")
    .select("id")
    .in("onboarding_status", [
      "fully_onboarded",
      "whatsapp_active",
      "widget_complete",
    ]);

  if (error || !businesses) {
    console.error("Failed to fetch businesses:", error);
    return Response.json(
      { error: "Failed to fetch businesses" },
      { status: 500 }
    );
  }

  let businessesProcessed = 0;
  let matchesSuggested = 0;

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  for (const business of businesses) {
    // Rate limit: max 3 suggestions per business per week
    const { count } = await supabase
      .from("introductions")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("status", "suggested")
      .gte("created_at", oneWeekAgo.toISOString());

    if ((count ?? 0) >= 3) {
      continue;
    }

    const matches = await findMatchesForBusiness(business.id);
    businessesProcessed++;

    for (const match of matches) {
      const { error: introError } = await supabase
        .from("introductions")
        .insert({
          business_id: business.id,
          newsletter_id: match.newsletter.id,
          status: "suggested",
          match_score: match.score,
          match_reasoning: match.reasoning,
        });

      if (introError) {
        console.error("Failed to create introduction:", introError);
      } else {
        matchesSuggested++;
      }
    }
  }

  return Response.json({ businessesProcessed, matchesSuggested });
}
