import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/twilio";

export { sendPlacementReminders };

async function sendPlacementReminders(supabase: ReturnType<typeof createServiceClient>) {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  // Find escrowed transactions where placement date has passed and no proof submitted
  const { data: overdueTransactions, error } = await supabase
    .from("transactions")
    .select("id, introduction_id, agreed_deliverables, proof_submitted_at")
    .eq("status", "escrowed")
    .is("proof_submitted_at", null);

  if (error) {
    console.error("Failed to query overdue transactions:", error);
    return 0;
  }

  if (!overdueTransactions || overdueTransactions.length === 0) {
    return 0;
  }

  let remindersSent = 0;

  for (const tx of overdueTransactions) {
    // Check if placement_date has passed
    const placementDate = tx.agreed_deliverables?.placement_date;
    if (!placementDate || placementDate > today) {
      continue;
    }

    // Fetch introduction details
    const { data: introduction } = await supabase
      .from("introductions")
      .select("id, newsletter_id, business_id")
      .eq("id", tx.introduction_id)
      .single();

    if (!introduction) continue;

    // Fetch newsletter and business profiles
    const [{ data: newsletter }, { data: business }] = await Promise.all([
      supabase
        .from("newsletter_profiles")
        .select("id, newsletter_name, phone, owner_name")
        .eq("id", introduction.newsletter_id)
        .single(),
      supabase
        .from("business_profiles")
        .select("id, company_name")
        .eq("id", introduction.business_id)
        .single(),
    ]);

    if (!newsletter?.phone) continue;

    const ownerName = newsletter.owner_name ?? "there";
    const companyName = business?.company_name ?? "the business";
    const newsletterName = newsletter.newsletter_name ?? "your newsletter";
    const formattedDate = new Date(placementDate).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
    });

    const reminderText = `Hi ${ownerName}! Just a reminder: the placement for ${companyName} in ${newsletterName} was scheduled for ${formattedDate}.\n\nOnce it's live, please send me a screenshot of your analytics and confirm the tracking link was included. This triggers the payment release.`;

    await sendWhatsAppMessage(newsletter.phone, reminderText);

    await supabase.from("agent_messages").insert({
      direction: "outbound",
      user_type: "newsletter",
      user_id: newsletter.id,
      phone: newsletter.phone,
      content: reminderText,
    });

    remindersSent++;
  }

  return remindersSent;
}

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
  const remindersSent = await sendPlacementReminders(supabase);

  return Response.json({ remindersSent });
}
