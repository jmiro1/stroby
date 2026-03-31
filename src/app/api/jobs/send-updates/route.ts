import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/twilio";

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

  // Fetch active newsletter owners
  const { data: newsletters, error } = await supabase
    .from("newsletter_profiles")
    .select("id, phone, newsletter_name, primary_niche")
    .in("onboarding_status", [
      "fully_onboarded",
      "whatsapp_active",
      "widget_complete",
    ]);

  if (error || !newsletters) {
    console.error("Failed to fetch newsletter profiles:", error);
    return Response.json(
      { error: "Failed to fetch newsletters" },
      { status: 500 }
    );
  }

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  let updatesSent = 0;

  for (const newsletter of newsletters) {
    if (!newsletter.primary_niche || !newsletter.phone) continue;

    // Count new businesses in their niche this week
    const { count } = await supabase
      .from("business_profiles")
      .select("id", { count: "exact", head: true })
      .eq("primary_niche", newsletter.primary_niche)
      .gte("created_at", oneWeekAgo.toISOString());

    if ((count ?? 0) > 0) {
      const updateText = `Hey ${newsletter.newsletter_name || "there"}! Quick weekly update from Stroby: ${count} new ${count === 1 ? "business" : "businesses"} in ${newsletter.primary_niche} joined this week looking for newsletter sponsorships. We're working on finding the best matches for you. Stay tuned!`;

      // Log the outbound message to agent_messages
      const { error: msgError } = await supabase
        .from("agent_messages")
        .insert({
          direction: "outbound",
          user_type: "newsletter",
          user_id: newsletter.id,
          phone: newsletter.phone,
          content: updateText,
        });

      if (msgError) {
        console.error("Failed to log update message:", msgError);
      } else {
        await sendWhatsAppMessage(newsletter.phone, updateText);
        updatesSent++;
      }
    }
  }

  return Response.json({
    newslettersChecked: newsletters.length,
    updatesSent,
  });
}
