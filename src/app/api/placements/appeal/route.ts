import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

export async function POST(request: NextRequest) {
  const supabase = createServiceClient();

  let body: { transactionId: string; reason: string };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { transactionId, reason } = body;

  if (!transactionId || !reason) {
    return Response.json(
      { error: "transactionId and reason are required" },
      { status: 400 }
    );
  }

  // Fetch the transaction
  const { data: transaction, error: txError } = await supabase
    .from("transactions")
    .select("id, status, introduction_id")
    .eq("id", transactionId)
    .single();

  if (txError || !transaction) {
    return Response.json(
      { error: "Transaction not found" },
      { status: 404 }
    );
  }

  if (transaction.status !== "appeal_window") {
    return Response.json(
      { error: `Transaction status is '${transaction.status}', must be 'appeal_window'` },
      { status: 400 }
    );
  }

  // Update transaction
  const { error: updateError } = await supabase
    .from("transactions")
    .update({
      status: "appeal_filed",
      appeal_reason: reason,
    })
    .eq("id", transactionId);

  if (updateError) {
    console.error("Failed to update transaction with appeal:", updateError);
    return Response.json(
      { error: "Failed to file appeal" },
      { status: 500 }
    );
  }

  // Fetch introduction details
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

  // Send WhatsApp to business
  if (business?.phone) {
    const businessMsg = `I've received your appeal for the placement in ${newsletter?.newsletter_name ?? "the newsletter"}. Our team will review it within 3 business days. We'll keep you posted.`;
    await sendWhatsAppMessage(business.phone, businessMsg);

    await supabase.from("agent_messages").insert({
      direction: "outbound",
      user_type: "business",
      user_id: business.id,
      phone: business.phone,
      content: businessMsg,
    });
  }

  // Send WhatsApp to newsletter owner
  if (newsletter?.phone) {
    const newsletterMsg = `A review has been requested for your placement with ${business?.company_name ?? "the business"}. This is standard process \u2014 we'll be in touch soon with an update.`;
    await sendWhatsAppMessage(newsletter.phone, newsletterMsg);

    await supabase.from("agent_messages").insert({
      direction: "outbound",
      user_type: "newsletter",
      user_id: newsletter.id,
      phone: newsletter.phone,
      content: newsletterMsg,
    });
  }

  return Response.json({ success: true });
}
