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
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;
        const transactionId = paymentIntent.metadata?.transaction_id;

        if (transactionId) {
          const { error } = await supabase
            .from("transactions")
            .update({ status: "escrowed" })
            .eq("id", transactionId);

          if (error) {
            console.error("Failed to update transaction status:", error);
          }
        } else {
          console.warn(
            "payment_intent.succeeded without transaction_id in metadata:",
            paymentIntent.id
          );
        }
        break;
      }

      case "account.updated": {
        const account = event.data.object;
        const profileId = account.metadata?.profile_id;

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
