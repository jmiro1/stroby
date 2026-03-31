import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";

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

  // Query transactions where appeal window has expired
  const { data: expiredAppeals, error } = await supabase
    .from("transactions")
    .select("id, introduction_id, amount, newsletter_owner_id")
    .eq("status", "appeal_window")
    .lt("appeal_deadline", new Date().toISOString());

  if (error) {
    console.error("Failed to query expired appeals:", error);
    return Response.json(
      { error: "Failed to query transactions" },
      { status: 500 }
    );
  }

  if (!expiredAppeals || expiredAppeals.length === 0) {
    return Response.json({ processed: 0, message: "No expired appeals" });
  }

  let processed = 0;

  for (const transaction of expiredAppeals) {
    // TODO: Trigger actual Stripe transfer to newsletter owner's connected account
    // For now, just update the status to 'released'
    const { error: updateError } = await supabase
      .from("transactions")
      .update({
        status: "released",
        released_at: new Date().toISOString(),
      })
      .eq("id", transaction.id);

    if (updateError) {
      console.error(
        `Failed to release transaction ${transaction.id}:`,
        updateError
      );
    } else {
      processed++;
    }
  }

  return Response.json({
    processed,
    total: expiredAppeals.length,
  });
}
