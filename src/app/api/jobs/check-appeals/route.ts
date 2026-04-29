import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { sendPlacementReminders } from "@/app/api/placements/remind/route";
import { recordCommissionForTransaction } from "@/lib/affiliates/commissions";
import { verifyCronAuth } from "@/lib/cron-auth";

export async function POST(request: NextRequest) {
  const auth = verifyCronAuth(request.headers.get("authorization"));
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const supabase = createServiceClient();

  // --- 1. Process expired appeal windows (release payments) ---

  const { data: expiredAppeals, error } = await supabase
    .from("transactions")
    .select("id, introduction_id, amount, payout_amount, newsletter_id")
    .eq("status", "appeal_window")
    .lt("appeal_deadline", new Date().toISOString());

  if (error) {
    console.error("Failed to query expired appeals:", error);
    return Response.json(
      { error: "Failed to query transactions" },
      { status: 500 }
    );
  }

  let released = 0;
  let skipped = 0;

  if (expiredAppeals && expiredAppeals.length > 0) {
    for (const transaction of expiredAppeals) {
      // Fetch introduction to get newsletter_id and business_id
      const { data: introduction } = await supabase
        .from("introductions")
        .select("id, newsletter_id, business_id")
        .eq("id", transaction.introduction_id)
        .single();

      if (!introduction) {
        console.warn(`No introduction found for transaction ${transaction.id}`);
        skipped++;
        continue;
      }

      // Fetch newsletter owner's stripe_account_id
      const { data: newsletter } = await supabase
        .from("newsletter_profiles")
        .select("id, stripe_account_id, newsletter_name, phone")
        .eq("id", introduction.newsletter_id)
        .single();

      if (!newsletter?.stripe_account_id) {
        console.warn(
          `No stripe_account_id for newsletter ${introduction.newsletter_id}, skipping release for transaction ${transaction.id}`
        );
        skipped++;
        continue;
      }

      // Create Stripe transfer to newsletter owner's connected account.
      // Idempotency key prevents double-payouts if the cron retries or
      // overlaps with the manual /api/stripe/payout endpoint — Stripe
      // returns the existing transfer instead of creating a new one.
      try {
        const transfer = await getStripe().transfers.create(
          {
            amount: transaction.payout_amount,
            currency: "usd",
            destination: newsletter.stripe_account_id,
            metadata: { transaction_id: transaction.id },
          },
          { idempotencyKey: `payout:${transaction.id}` }
        );

        // Update transaction as released
        const { error: updateError } = await supabase
          .from("transactions")
          .update({
            status: "released",
            stripe_transfer_id: transfer.id,
            released_at: new Date().toISOString(),
          })
          .eq("id", transaction.id);

        if (updateError) {
          console.error(
            `Failed to update transaction ${transaction.id}:`,
            updateError
          );
          continue;
        }

        // Affiliate commission hook — best-effort, never blocks the payout flow.
        // See AFFILIATE_PRD.md §6 Flow D for the math + cases.
        try {
          const result = await recordCommissionForTransaction(transaction.id);
          if (result.commissions_created > 0) {
            console.log(
              `affiliate: created ${result.commissions_created} commission(s) for transaction ${transaction.id}`
            );
          }
        } catch (affErr) {
          console.error(
            `affiliate commission hook failed for transaction ${transaction.id}:`,
            affErr
          );
        }

        // Fetch business profile for messaging
        const { data: business } = await supabase
          .from("business_profiles")
          .select("id, company_name, phone")
          .eq("id", introduction.business_id)
          .single();

        // Send WhatsApp to newsletter owner
        if (newsletter.phone) {
          const payoutFormatted = (transaction.payout_amount / 100).toFixed(2);
          const ownerMsg = `Payment of $${payoutFormatted} has been released to your account for the placement with ${business?.company_name ?? "the business"}!`;
          await sendWhatsAppMessage(newsletter.phone, ownerMsg);

          await supabase.from("agent_messages").insert({
            direction: "outbound",
            user_type: "newsletter",
            user_id: newsletter.id,
            phone: newsletter.phone,
            content: ownerMsg,
          });
        }

        // Send WhatsApp to business
        if (business?.phone) {
          const businessMsg = `The review period for your placement in ${newsletter.newsletter_name ?? "the newsletter"} has completed. Payment has been released. Thanks for using Stroby!`;
          await sendWhatsAppMessage(business.phone, businessMsg);

          await supabase.from("agent_messages").insert({
            direction: "outbound",
            user_type: "business",
            user_id: business.id,
            phone: business.phone,
            content: businessMsg,
          });
        }

        released++;
      } catch (stripeError) {
        console.error(
          `Stripe transfer failed for transaction ${transaction.id}:`,
          stripeError
        );
        skipped++;
      }
    }
  }

  // --- 2. Run placement reminders inline ---

  const remindersSent = await sendPlacementReminders(supabase);

  return Response.json({
    appeals: {
      processed: released,
      skipped,
      total: expiredAppeals?.length ?? 0,
    },
    remindersSent,
  });
}
