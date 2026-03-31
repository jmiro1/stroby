import { NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase";

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

    // Look up transaction — must be in appeal_window and past the deadline
    const { data: transaction, error: txError } = await supabase
      .from("transactions")
      .select(
        `
        *,
        introduction:introductions (
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

    if (transaction.status !== "appeal_window") {
      return Response.json(
        { error: "Transaction is not in appeal window" },
        { status: 400 }
      );
    }

    const now = new Date();
    const appealDeadline = new Date(transaction.appeal_deadline);

    if (appealDeadline > now) {
      return Response.json(
        { error: "Appeal window has not yet expired" },
        { status: 400 }
      );
    }

    if (transaction.appeal_filed) {
      return Response.json(
        { error: "An appeal has been filed for this transaction" },
        { status: 400 }
      );
    }

    // Look up newsletter owner's stripe_account_id
    const stripeAccountId =
      transaction.introduction?.newsletter?.stripe_account_id;

    if (!stripeAccountId) {
      return Response.json(
        { error: "Newsletter owner has no connected Stripe account" },
        { status: 400 }
      );
    }

    // Create transfer to connected account
    const transfer = await stripe.transfers.create({
      amount: transaction.payout_amount,
      currency: "usd",
      destination: stripeAccountId,
      metadata: { transaction_id: transactionId },
    });

    // Update transaction status to released
    const { error: updateError } = await supabase
      .from("transactions")
      .update({
        status: "released",
        stripe_transfer_id: transfer.id,
        released_at: new Date().toISOString(),
      })
      .eq("id", transactionId);

    if (updateError) {
      console.error("Failed to update transaction after payout:", updateError);
      return Response.json(
        { error: "Payout succeeded but failed to update transaction record" },
        { status: 500 }
      );
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error("Stripe payout error:", err);
    return Response.json(
      { error: "Failed to process payout" },
      { status: 500 }
    );
  }
}
