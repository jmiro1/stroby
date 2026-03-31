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

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Find released transactions where released_at is 7+ days ago
  const { data: transactions, error } = await supabase
    .from("transactions")
    .select("id, introduction_id, released_at")
    .eq("status", "released")
    .lt("released_at", sevenDaysAgo.toISOString());

  if (error) {
    console.error("Failed to query released transactions:", error);
    return Response.json(
      { error: "Failed to query transactions" },
      { status: 500 }
    );
  }

  if (!transactions || transactions.length === 0) {
    return Response.json({ followupsSent: 0 });
  }

  let followupsSent = 0;

  for (const tx of transactions) {
    // Check if the introduction already has both ratings
    const { data: intro } = await supabase
      .from("introductions")
      .select("id, business_rating, newsletter_rating, newsletter_id, business_id")
      .eq("id", tx.introduction_id)
      .single();

    if (!intro) continue;

    // Skip if both ratings already exist
    if (intro.business_rating != null && intro.newsletter_rating != null) {
      continue;
    }

    // Fetch profiles
    const [{ data: newsletter }, { data: business }] = await Promise.all([
      supabase
        .from("newsletter_profiles")
        .select("id, newsletter_name, phone")
        .eq("id", intro.newsletter_id)
        .single(),
      supabase
        .from("business_profiles")
        .select("id, company_name, phone")
        .eq("id", intro.business_id)
        .single(),
    ]);

    // Send feedback request to business (if not already rated)
    if (intro.business_rating == null && business?.phone) {
      const businessMsg = `How did your placement in ${newsletter?.newsletter_name ?? "the newsletter"} go? Rate 1-5 (5 = perfect fit). Would you book again? Any other feedback?`;
      await sendWhatsAppMessage(business.phone, businessMsg);

      await supabase.from("agent_messages").insert({
        direction: "outbound",
        user_type: "business",
        user_id: business.id,
        phone: business.phone,
        content: businessMsg,
      });
    }

    // Send feedback request to newsletter (if not already rated)
    if (intro.newsletter_rating == null && newsletter?.phone) {
      const newsletterMsg = `How was working with ${business?.company_name ?? "the business"}? Rate 1-5 (5 = great experience). Any feedback?`;
      await sendWhatsAppMessage(newsletter.phone, newsletterMsg);

      await supabase.from("agent_messages").insert({
        direction: "outbound",
        user_type: "newsletter",
        user_id: newsletter.id,
        phone: newsletter.phone,
        content: newsletterMsg,
      });
    }

    followupsSent++;
  }

  return Response.json({ followupsSent });
}
