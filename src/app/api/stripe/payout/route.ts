import { NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthed } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  // No internal callers — this endpoint exists for manual ops use.
  // Without admin auth, an anonymous caller could trigger early payouts
  // (status guards limit but don't eliminate impact). The safer path is
  // the check-appeals cron; this is a manual override.
  if (!isAdminAuthed(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

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

    const now = new Date();
    const appealDeadline = new Date(transaction.appeal_deadline);

    if (appealDeadline > now) {
      return Response.json(
        { error: "Appeal window has not yet expired" },
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

    // Atomic claim — flips status to 'paying' only if we're still in
    // appeal_window AND no appeal was filed. Two concurrent calls race
    // here; only one matches the WHERE clause. Without this, the prior
    // read-then-write pattern could let two callers each create a Stripe
    // transfer before the first one updated status, double-paying out.
    const { data: claimed, error: claimError } = await supabase
      .from("transactions")
      .update({ status: "paying" })
      .eq("id", transactionId)
      .eq("status", "appeal_window")
      .eq("appeal_filed", false)
      .select("id")
      .maybeSingle();

    if (claimError) {
      console.error("Payout claim failed:", claimError);
      return Response.json({ error: "Failed to claim transaction for payout" }, { status: 500 });
    }
    if (!claimed) {
      return Response.json(
        { error: "Transaction not eligible for payout (not in appeal_window, or appeal_filed)" },
        { status: 400 }
      );
    }

    // Stripe idempotency key — duplicate transfer requests for the same
    // transaction return the original transfer instead of creating a new
    // one. Belt-and-braces with the atomic claim above.
    const transfer = await stripe.transfers.create(
      {
        amount: transaction.payout_amount,
        currency: "usd",
        destination: stripeAccountId,
        metadata: { transaction_id: transactionId },
      },
      { idempotencyKey: `payout:${transactionId}` }
    );

    // Promote claimed → released
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
