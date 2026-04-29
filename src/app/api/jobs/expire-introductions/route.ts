import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

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

  // Two stale states to clean up:
  //   - 'suggested' older than 72h → brand never responded
  //   - 'business_accepted' older than 72h → creator never responded
  // We use the right timestamp column for each so the timeout is measured
  // from when that party was actually pinged, not when the intro was first
  // created.
  const cutoff72h = new Date();
  cutoff72h.setHours(cutoff72h.getHours() - 72);

  const { data: staleSuggested, error: errSuggested } = await supabase
    .from("introductions")
    .select("id, business_id, newsletter_id, creator_id, creator_type, match_score, status, business_profiles(*), newsletter_profiles(*)")
    .eq("status", "suggested")
    .lt("created_at", cutoff72h.toISOString());

  if (errSuggested) {
    console.error("Failed to fetch stale 'suggested' introductions:", errSuggested);
    return Response.json(
      { error: "Failed to fetch stale introductions" },
      { status: 500 }
    );
  }

  const { data: staleBusinessAccepted, error: errBA } = await supabase
    .from("introductions")
    .select("id, business_id, newsletter_id, creator_id, creator_type, match_score, status, business_profiles(*), newsletter_profiles(*)")
    .eq("status", "business_accepted")
    .lt("business_response_at", cutoff72h.toISOString());

  if (errBA) {
    console.error("Failed to fetch stale 'business_accepted' introductions:", errBA);
    // Continue with whatever we have rather than failing the whole job
  }

  const staleIntros = [
    ...(staleSuggested || []),
    ...(staleBusinessAccepted || []),
  ];

  if (staleIntros.length === 0) {
    return Response.json({ expired: 0 });
  }

  let expiredCount = 0;

  for (const intro of staleIntros) {
    // Update status to expired
    const { error: updateError } = await supabase
      .from("introductions")
      .update({ status: "expired" })
      .eq("id", intro.id);

    if (updateError) {
      console.error(`Failed to expire introduction ${intro.id}:`, updateError);
      continue;
    }

    // Phase 2/4 prep: log expiry as a match_decision so the memory layer
    // can learn from no-response patterns ("brand X tends to ignore
    // suggestions; lower their proposal frequency").
    if (intro.creator_type === "newsletter" || intro.newsletter_id) {
      try {
        await supabase.from("match_decisions").insert({
          creator_id: (intro.creator_id || intro.newsletter_id) as string,
          brand_id: intro.business_id as string,
          decision: "no_response_3d",
          decided_by: "system",
          source: "cron",
          match_score: (intro.match_score as number) ?? null,
          metadata: {
            expired_from_state: intro.status,
            introduction_id: intro.id,
          },
        });
      } catch (e) {
        console.error("match_decisions log (expiry) failed:", e);
      }
    }

    expiredCount++;

    const business = intro.business_profiles as unknown as Record<string, unknown>;
    const newsletter = intro.newsletter_profiles as unknown as Record<string, unknown>;

    // Send expiration message to the business
    if (business?.phone) {
      const newsletterName =
        (newsletter?.newsletter_name as string) || "the newsletter";
      const expireMsg = `The match suggestion for ${newsletterName} has expired. Don't worry, I'll keep finding new matches for you!`;

      const messageSid = await sendWhatsAppMessage(
        business.phone as string,
        expireMsg
      );

      await supabase.from("agent_messages").insert({
        direction: "outbound",
        user_type: "business",
        user_id: business.id,
        phone: business.phone,
        content: expireMsg,
        message_type: "expired_notification",
        related_introduction_id: intro.id,
        external_id: messageSid,
      });
    }
  }

  return Response.json({ expired: expiredCount });
}
