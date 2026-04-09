import { NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return Response.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  const rawBody = await request.text();

  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error(
      "Stripe webhook signature verification failed:",
      (err as Error).message
    );
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createServiceClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const transactionId = session.metadata?.transaction_id;

        if (transactionId) {
          const { error } = await supabase
            .from("transactions")
            .update({ status: "escrowed", stripe_payment_intent_id: session.payment_intent })
            .eq("id", transactionId);

          if (error) {
            console.error("Failed to update transaction on checkout:", error);
          }

          // Update introduction status to 'paid'
          const introId = session.metadata?.introduction_id;
          if (introId) {
            await supabase
              .from("introductions")
              .update({ status: "paid" })
              .eq("id", introId);
          }
        }
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;
        const transactionId = paymentIntent.metadata?.transaction_id;

        if (transactionId) {
          // Only update if not already escrowed (checkout.session.completed may have already handled it)
          const { error } = await supabase
            .from("transactions")
            .update({ status: "escrowed" })
            .eq("id", transactionId)
            .eq("status", "pending_payment");

          if (error) {
            console.error("Failed to update transaction status:", error);
          }
        }
        break;
      }

      case "account.updated": {
        const account = event.data.object;
        const profileId = account.metadata?.profile_id;
        const affiliateId = account.metadata?.affiliate_id;

        if (profileId) {
          const updateData: Record<string, unknown> = {
            stripe_account_id: account.id,
          };
          if (account.charges_enabled && account.payouts_enabled) {
            updateData.onboarding_status = "stripe_connected";
          }
          const { error } = await supabase
            .from("newsletter_profiles")
            .update(updateData)
            .eq("id", profileId);

          if (error) {
            console.error(
              "Failed to update newsletter stripe onboarding:",
              error
            );
          }
        }

        // Affiliate Connect onboarding (Phase 2)
        if (affiliateId) {
          const { error } = await supabase
            .from("affiliates")
            .update({
              stripe_account_id: account.id,
              stripe_payouts_enabled: !!(
                account.charges_enabled && account.payouts_enabled
              ),
            })
            .eq("id", affiliateId);
          if (error) {
            console.error("Failed to update affiliate stripe onboarding:", error);
          }
        }
        break;
      }

      case "charge.refunded": {
        // Affiliate clawback hook — best-effort, never blocks the webhook ack.
        // Looks up the transaction by stripe_payment_intent_id and runs the
        // clawback flow against any commissions tied to it.
        try {
          const charge = event.data.object;
          const piId = charge.payment_intent;
          if (typeof piId === "string") {
            const { data: txn } = await supabase
              .from("transactions")
              .select("id")
              .eq("stripe_payment_intent_id", piId)
              .maybeSingle();
            if (txn) {
              const { processRefundClawback } = await import(
                "@/lib/affiliates/commissions"
              );
              const result = await processRefundClawback(
                txn.id,
                `stripe charge.refunded ${charge.id}`,
              );
              if (result.cancelled || result.clawbacks_created) {
                console.log(
                  `affiliate clawback: txn=${txn.id} cancelled=${result.cancelled} clawbacks=${result.clawbacks_created}`
                );
              }
            }
          }
        } catch (clawbackErr) {
          console.error("affiliate clawback hook failed:", clawbackErr);
        }
        break;
      }

      default:
        // Unhandled event type — acknowledge receipt
        break;
    }

    return Response.json({ received: true });
  } catch (err) {
    console.error("Stripe webhook processing error:", err);
    return Response.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
