import { NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://stroby.ai";

export async function POST(request: NextRequest) {
  try {
    const { transactionId } = await request.json();

    if (!transactionId) {
      return Response.json(
        { error: "transactionId is required" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const stripe = getStripe();

    // Look up transaction with joined data
    const { data: transaction, error: txError } = await supabase
      .from("transactions")
      .select(
        `
        *,
        introduction:introductions (
          *,
          business:business_profiles (*),
          newsletter:newsletter_profiles (*)
        )
      `
      )
      .eq("id", transactionId)
      .single();

    if (txError || !transaction) {
      return Response.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    const businessId = transaction.introduction?.business?.id;
    const newsletterId = transaction.introduction?.newsletter?.id;
    const newsletterName =
      transaction.introduction?.newsletter?.newsletter_name || "Newsletter";

    // Create a Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Native distribution: ${newsletterName}`,
            },
            unit_amount: transaction.amount,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        metadata: {
          transaction_id: transactionId,
          business_id: businessId,
          newsletter_id: newsletterId,
        },
      },
      success_url:
        APP_URL + "/payment/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: APP_URL + "/payment/cancel",
    });

    return Response.json({ url: session.url });
  } catch (err) {
    console.error("Stripe payment link error:", err);
    return Response.json(
      { error: "Failed to create payment session" },
      { status: 500 }
    );
  }
}
