import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

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

  // Find introductions with status 'suggested' older than 72 hours
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 72);

  const { data: staleIntros, error } = await supabase
    .from("introductions")
    .select("id, business_id, newsletter_id, business_profiles(*), newsletter_profiles(*)")
    .eq("status", "suggested")
    .lt("created_at", cutoff.toISOString());

  if (error) {
    console.error("Failed to fetch stale introductions:", error);
    return Response.json(
      { error: "Failed to fetch stale introductions" },
      { status: 500 }
    );
  }

  if (!staleIntros || staleIntros.length === 0) {
    return Response.json({ expired: 0 });
  }

  let expiredCount = 0;

  for (const intro of staleIntros) {
    // Update status to expired
    const { error: updateError } = await supabase
      .from("introductions")
      .update({ status: "expired" })
      .eq("id", intro.id);

    if (updateError) {
      console.error(`Failed to expire introduction ${intro.id}:`, updateError);
      continue;
    }

    expiredCount++;

    const business = intro.business_profiles as unknown as Record<string, unknown>;
    const newsletter = intro.newsletter_profiles as unknown as Record<string, unknown>;

    // Send expiration message to the business
    if (business?.phone) {
      const newsletterName =
        (newsletter?.newsletter_name as string) || "the newsletter";
      const expireMsg = `The match suggestion for ${newsletterName} has expired. Don't worry, I'll keep finding new matches for you!`;

      const messageSid = await sendWhatsAppMessage(
        business.phone as string,
        expireMsg
      );

      await supabase.from("agent_messages").insert({
        direction: "outbound",
        user_type: "business",
        user_id: business.id,
        phone: business.phone,
        content: expireMsg,
        message_type: "expired_notification",
        related_introduction_id: intro.id,
        external_id: messageSid,
      });
    }
  }

  return Response.json({ expired: expiredCount });
}
