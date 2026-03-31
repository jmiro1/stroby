import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { sendWhatsAppMessage } from "@/lib/twilio";
import crypto from "crypto";

function generateUtmSlug(): string {
  return crypto.randomBytes(4).toString("hex"); // 8-char hex string
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    introductionId,
    amount,
    placementDate,
    adFormat,
    estimatedClicks,
    destinationUrl,
  }: {
    introductionId: string;
    amount: number;
    placementDate: string;
    adFormat: string;
    estimatedClicks: number;
    destinationUrl: string;
  } = body;

  if (!introductionId || !amount) {
    return Response.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  // Fetch the introduction (must be status 'introduced')
  const { data: intro, error: introError } = await supabase
    .from("introductions")
    .select("*, business_profiles(*), newsletter_profiles(*)")
    .eq("id", introductionId)
    .eq("status", "introduced")
    .single();

  if (introError || !intro) {
    return Response.json(
      { error: "Introduction not found or not in 'introduced' status" },
      { status: 404 }
    );
  }

  const business = intro.business_profiles as Record<string, unknown>;
  const newsletter = intro.newsletter_profiles as Record<string, unknown>;

  // Generate UTM slug and link
  const slug = generateUtmSlug();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://stroby.ai";
  const utmLink = `${appUrl}/r/${slug}`;

  // Calculate amounts (amount is in cents)
  const amountCents = Math.round(amount);
  const commissionCents = Math.round(amountCents * 0.15);
  const payoutCents = amountCents - commissionCents;

  // Create the transaction record
  const { data: transaction, error: txError } = await supabase
    .from("transactions")
    .insert({
      introduction_id: introductionId,
      business_id: business.id,
      newsletter_id: newsletter.id,
      amount: amountCents,
      commission: commissionCents,
      payout_amount: payoutCents,
      status: "pending_payment",
      utm_link: utmLink,
      utm_slug: slug,
      agreed_deliverables: {
        placement_date: placementDate,
        ad_format: adFormat,
        estimated_clicks: estimatedClicks,
        destination_url: destinationUrl,
      },
    })
    .select("id")
    .single();

  if (txError || !transaction) {
    console.error("Failed to create transaction:", txError);
    return Response.json(
      { error: "Failed to create transaction" },
      { status: 500 }
    );
  }

  // Create a Stripe Checkout session
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `Newsletter Sponsorship - ${newsletter.newsletter_name}`,
            description: `${adFormat || "Sponsored placement"} on ${placementDate || "TBD"}`,
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    metadata: {
      transaction_id: transaction.id,
      business_id: business.id as string,
      newsletter_id: newsletter.id as string,
      introduction_id: introductionId,
    },
    success_url: `${appUrl}/payment/success?transaction_id=${transaction.id}`,
    cancel_url: `${appUrl}/payment/cancelled?transaction_id=${transaction.id}`,
  });

  // Update transaction with Stripe session ID
  await supabase
    .from("transactions")
    .update({ stripe_session_id: session.id })
    .eq("id", transaction.id);

  // Send the payment link to the business via WhatsApp
  if (business.phone) {
    const paymentMsg = `Your sponsorship deal is ready! 🎉\n\n📰 Newsletter: ${newsletter.newsletter_name}\n💰 Amount: $${(amountCents / 100).toFixed(2)}\n📅 Placement date: ${placementDate || "TBD"}\n📝 Format: ${adFormat || "TBD"}\n\nPay securely here: ${session.url}\n\n🔒 Your payment is held in escrow until the placement is delivered and verified.\n\n📊 Track clicks with your UTM link: ${utmLink}`;

    const messageSid = await sendWhatsAppMessage(
      business.phone as string,
      paymentMsg
    );

    await supabase.from("agent_messages").insert({
      direction: "outbound",
      user_type: "business",
      user_id: business.id,
      phone: business.phone,
      content: paymentMsg,
      message_type: "payment_link",
      related_introduction_id: introductionId,
      external_id: messageSid,
    });
  }

  // Update introduction: became_deal
  await supabase
    .from("introductions")
    .update({ became_deal: true })
    .eq("id", introductionId);

  return Response.json({
    success: true,
    transactionId: transaction.id,
    paymentUrl: session.url,
    utmLink,
  });
}
