import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

/**
 * Calculate a date that is N business days from the given date (skips weekends).
 */
function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      added++;
    }
  }
  return result;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export async function POST(request: NextRequest) {
  const supabase = createServiceClient();

  let body: {
    transactionId: string;
    reportedClicks: number;
    reportedOpens: number;
    screenshotUrl?: string;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { transactionId, reportedClicks, reportedOpens, screenshotUrl } = body;

  if (!transactionId || reportedClicks == null || reportedOpens == null) {
    return Response.json(
      { error: "transactionId, reportedClicks, and reportedOpens are required" },
      { status: 400 }
    );
  }

  // Fetch the transaction
  const { data: transaction, error: txError } = await supabase
    .from("transactions")
    .select(
      "id, status, introduction_id, amount, payout_amount, tracked_clicks, agreed_deliverables"
    )
    .eq("id", transactionId)
    .single();

  if (txError || !transaction) {
    return Response.json(
      { error: "Transaction not found" },
      { status: 404 }
    );
  }

  if (
    transaction.status !== "escrowed" &&
    transaction.status !== "placement_delivered"
  ) {
    return Response.json(
      { error: `Transaction status is '${transaction.status}', must be 'escrowed' or 'placement_delivered'` },
      { status: 400 }
    );
  }

  // Calculate appeal deadline (5 business days from now)
  const now = new Date();
  const appealDeadline = addBusinessDays(now, 5);

  // Update transaction with proof data
  const updateData: Record<string, unknown> = {
    reported_clicks: reportedClicks,
    reported_opens: reportedOpens,
    proof_submitted_at: now.toISOString(),
    status: "proof_submitted",
    appeal_deadline: appealDeadline.toISOString(),
  };

  if (screenshotUrl) {
    updateData.proof_screenshot_url = screenshotUrl;
  }

  const { error: updateError } = await supabase
    .from("transactions")
    .update(updateData)
    .eq("id", transactionId);

  if (updateError) {
    console.error("Failed to update transaction with proof:", updateError);
    return Response.json(
      { error: "Failed to update transaction" },
      { status: 500 }
    );
  }

  // Transition to appeal_window status
  const { error: windowError } = await supabase
    .from("transactions")
    .update({ status: "appeal_window" })
    .eq("id", transactionId);

  if (windowError) {
    console.error("Failed to set appeal_window status:", windowError);
  }

  // Fetch introduction details for messaging
  const { data: introduction } = await supabase
    .from("introductions")
    .select("id, newsletter_id, business_id")
    .eq("id", transaction.introduction_id)
    .single();

  if (!introduction) {
    return Response.json({ success: true, warning: "Could not fetch introduction for messaging" });
  }

  // Fetch newsletter and business profiles
  const [{ data: newsletter }, { data: business }] = await Promise.all([
    supabase
      .from("newsletter_profiles")
      .select("id, newsletter_name, phone")
      .eq("id", introduction.newsletter_id)
      .single(),
    supabase
      .from("business_profiles")
      .select("id, company_name, phone")
      .eq("id", introduction.business_id)
      .single(),
  ]);

  // Send WhatsApp to business with results
  if (business?.phone) {
    const trackedClicks = transaction.tracked_clicks ?? 0;
    const messageText = `Your placement in ${newsletter?.newsletter_name ?? "the newsletter"} has been delivered! Here are the results:\n\n\u{1F4CA} ${reportedClicks} clicks | ${trackedClicks} tracked via our link\n\nYou have 5 business days to review (until ${formatDate(appealDeadline)}). If everything looks good, payment will be released automatically. If there's an issue, just let me know.`;

    await sendWhatsAppMessage(business.phone, messageText);

    // Log message to agent_messages
    await supabase.from("agent_messages").insert({
      direction: "outbound",
      user_type: "business",
      user_id: business.id,
      phone: business.phone,
      content: messageText,
    });
  }

  return Response.json({ success: true });
}
