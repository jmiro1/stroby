import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { findMatchesForBusiness } from "@/lib/matching";
import { sendWhatsAppButtonsSmart } from "@/lib/whatsapp";
import { updateUserInsights } from "@/lib/user-insights";
import { sendEngagementDrips, sendPostIntroFollowups, sendMonthlyRecaps } from "@/lib/engagement-drips";
import { generateVoiceMessage, isVoiceEnabled } from "@/lib/tts";
import { uploadWhatsAppAudio, sendWhatsAppAudio } from "@/lib/whatsapp";
import { verifyCronAuth } from "@/lib/cron-auth";

export async function POST(request: NextRequest) {
  const auth = verifyCronAuth(request.headers.get("authorization"));
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const supabase = createServiceClient();

  // Fetch all active businesses that are onboarded
  const { data: businesses, error } = await supabase
    .from("business_profiles")
    .select("*")
    .in("onboarding_status", [
      "fully_onboarded",
      "whatsapp_active",
      "widget_complete",
    ]);

  if (error || !businesses) {
    console.error("Failed to fetch businesses:", error);
    return Response.json(
      { error: "Failed to fetch businesses" },
      { status: 500 }
    );
  }

  let businessesProcessed = 0;
  let matchesSuggested = 0;

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  // Phase 3: weekly proactive push gate.
  // Match-suggestion runs ONLY on Wednesdays. The rest of this cron
  // (engagement drips, post-intro followups, admin digest) keeps running
  // daily — those don't have the same noise concerns. UTC Wednesday hits
  // 11am Buenos Aires / 10am ET / 7am PT / 3pm London at the standard
  // 14:00 fire time — comfortable working hours for most user bases.
  const today = new Date();
  const isWednesday = today.getUTCDay() === 3;

  if (isWednesday) for (const business of businesses) {
    // Rate limit: 1 suggestion per business per week (Boardy-level
    // single-suggestion UX). Lifted from "max 3/week" so users get a
    // single high-quality push instead of three lower-quality ones.
    const { count } = await supabase
      .from("introductions")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("status", "suggested")
      .gte("created_at", oneWeekAgo.toISOString());

    if ((count ?? 0) >= 1) {
      continue;
    }

    const allMatches = await findMatchesForBusiness(business.id);
    // Phase 3: send only the TOP match this Wednesday. The next match
    // (if any) waits until next Wednesday's fire. Keeps the UX as one
    // proposal at a time — easier to evaluate, higher accept rate.
    const matches = allMatches.slice(0, 1);
    businessesProcessed++;

    for (const match of matches) {
      // Insert the introduction record
      const insertData: Record<string, unknown> = {
        business_id: business.id,
        status: "suggested",
        match_score: match.score,
        match_reasoning: match.reasoning,
        match_concerns: match.concerns || null,
        niche_distance: match.nicheDistance ?? null,
        creator_id: match.creatorId,
        creator_type: match.creatorType,
      };

      // Also set newsletter_id for backwards compat when it's a newsletter
      if (match.creatorType === "newsletter") {
        insertData.newsletter_id = match.creatorId;
      }

      const { data: intro, error: introError } = await supabase
        .from("introductions")
        .insert(insertData)
        .select("id")
        .single();

      if (introError || !intro) {
        console.error("Failed to create introduction:", introError);
        continue;
      }

      // Phase 1/4 prep: log every proposed match in match_decisions so the
      // memory layer (Phase 4) can read prior decisions back into the rerank
      // prompt. Failure here is non-blocking — we never want this to take
      // down the cron.
      try {
        await supabase.from("match_decisions").insert({
          creator_id: match.creatorId,
          creator_type: match.creatorType,
          brand_id: business.id,
          decision: "proposed",
          decided_by: "system",
          source: "cron",
          match_score: match.score,
          metadata: {
            reasoning: match.reasoning,
            concerns: match.concerns ?? null,
            niche_distance: match.nicheDistance ?? null,
            introduction_id: intro.id,
          },
        });
      } catch (e) {
        console.error("match_decisions log (proposed) failed:", e);
      }

      matchesSuggested++;

      // Track insight: match suggested
      await updateUserInsights(business.id, "business", {
        type: "match_suggested",
        niche: match.newsletter?.primary_niche || match.otherProfile?.niche || "Unknown",
        score: match.score,
      });

      if (!business.phone) continue;

      let messageBody: string;

      // Concise body — buttons replace the typed CTA, so we drop "Reply YES,
      // NO, or TELL ME MORE." Reasoning leads (it's the most-valuable line),
      // metrics are secondary, profile link last. WhatsApp *bold* / _italic_
      // for visual hierarchy without emoji-bullet noise.
      if (match.creatorType === "newsletter" && match.newsletter) {
        const nl = match.newsletter;
        const priceDisplay = nl.price_per_placement
          ? `$${(nl.price_per_placement / 100).toFixed(0)}`
          : "open to inquiries";
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://stroby.ai";
        const profileLink = nl.slug ? `\n${appUrl}/creator/${nl.slug}` : "";
        const subs = nl.subscriber_count ? `${nl.subscriber_count.toLocaleString()} subs` : null;
        const openRate = nl.avg_open_rate ? `${nl.avg_open_rate}% open rate` : null;
        const metricLine = [subs, openRate, priceDisplay].filter(Boolean).join(" · ");
        messageBody = `${match.reasoning}\n\n*${nl.newsletter_name}* — ${nl.primary_niche || "General"}\n${metricLine}${profileLink}`;
      } else if (match.otherProfile) {
        const cr = match.otherProfile;
        const role = [cr.role, cr.organization].filter(Boolean).join(" at ");
        const tail = cr.can_offer ? `\n_Offers:_ ${cr.can_offer.slice(0, 200)}` : "";
        messageBody = `${match.reasoning}\n\n*${cr.name}*${role ? ` (${role})` : ""} — ${cr.niche || "General"}${tail}`;
      } else {
        continue;
      }

      // Build template param {{2}} — the match description portion
      let matchDesc: string;
      if (match.creatorType === "newsletter" && match.newsletter) {
        const nl = match.newsletter;
        const priceDisplay = nl.price_per_placement
          ? `$${(nl.price_per_placement / 100).toFixed(0)}`
          : "TBD";
        matchDesc = `📰 ${nl.newsletter_name}\n🎯 Niche: ${nl.primary_niche || "General"}\n👥 ${nl.subscriber_count || "N/A"} subscribers | ${nl.avg_open_rate || "N/A"}% open rate\n💰 ${priceDisplay} per placement\n\nWhy: ${match.reasoning}`;
      } else {
        const cr = match.otherProfile!;
        matchDesc = `🎨 ${cr.name}${cr.role ? ` (${cr.role})` : ""}${cr.organization ? ` at ${cr.organization}` : ""}\n🎯 Niche: ${cr.niche || "General"}\n📝 ${cr.description || "N/A"}\n💡 Offers: ${cr.can_offer || "N/A"}\n\nWhy: ${match.reasoning}`;
      }

      // Interactive buttons (in-window) → falls back to text → falls back to
      // approved template. Button reply ids land in the inbound webhook's
      // ROUTE table → mapped to "yes" / "no" / "tell me more" → existing
      // intro-response flow handles them.
      const messageSid = await sendWhatsAppButtonsSmart(
        business.phone,
        messageBody,
        [
          { id: "btn_intro_yes", title: "Yes" },
          { id: "btn_intro_more", title: "Tell me more" },
          { id: "btn_intro_no", title: "Pass" },
        ],
        "match_found",
        [business.contact_name || business.company_name, matchDesc]
      );

      // Voice message (beta, behind toggle) — sent after the text
      if (isVoiceEnabled()) {
        try {
          const voiceScript = `Hey. ${business.contact_name || business.company_name}. Stroby here. Found someone interesting for you. Take a look when you get a moment.`;
          const audioBuffer = await generateVoiceMessage(voiceScript);
          if (audioBuffer) {
            const mediaId = await uploadWhatsAppAudio(audioBuffer);
            if (mediaId) await sendWhatsAppAudio(business.phone, mediaId);
          }
        } catch (err) {
          console.error("Voice message failed:", err);
        }
      }

      await supabase.from("agent_messages").insert({
        direction: "outbound",
        user_type: "business",
        user_id: business.id,
        phone: business.phone,
        content: messageBody,
        message_type: "match_suggestion",
        related_introduction_id: intro.id,
        external_id: messageSid,
      });
    }
  }

  // Phase 5: weekly implicit-graph recompute, gated to Sunday so it
  // doesn't redo work every day. Cheap (≤14k brands × ≤6k creators
  // sparse intersection) but pointless to run on data that didn't change
  // since yesterday.
  let graphRecompute: { brandPairs: number; creatorPairs: number; deals: number } | null = null;
  if (today.getUTCDay() === 0) {
    try {
      const { recomputeGraph } = await import("@/lib/intelligence/graph");
      graphRecompute = await recomputeGraph(supabase);
      console.info(`recomputeGraph: brandPairs=${graphRecompute.brandPairs} creatorPairs=${graphRecompute.creatorPairs} deals=${graphRecompute.deals}`);
    } catch (err) {
      console.error("recomputeGraph error:", err);
    }
  }

  // Run engagement drips (day 1, 3, 7)
  let dripsSent = 0;
  try {
    dripsSent = await sendEngagementDrips();
  } catch (err) {
    console.error("Engagement drips error:", err);
  }

  // Post-intro follow-ups (3 days after introduction)
  let followupsSent = 0;
  try {
    followupsSent = await sendPostIntroFollowups();
  } catch (err) {
    console.error("Post-intro followup error:", err);
  }

  // Monthly recaps (runs on 1st of month only)
  let recapsSent = 0;
  try {
    recapsSent = await sendMonthlyRecaps();
  } catch (err) {
    console.error("Monthly recap error:", err);
  }

  // Daily admin digest — pending verifications + flagged messages
  try {
    const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER;
    if (adminPhone) {
      const { count: pendingVerifications } = await supabase
        .from("newsletter_profiles")
        .select("id", { count: "exact", head: true })
        .eq("verification_status", "screenshot")
        .not("verification_data->status", "eq", "auto_verified");

      const { count: flaggedCount } = await supabase
        .from("flagged_messages")
        .select("id", { count: "exact", head: true })
        .eq("reviewed", false);

      const { count: newSignups } = await supabase
        .from("newsletter_profiles")
        .select("id", { count: "exact", head: true })
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      const { count: newBiz } = await supabase
        .from("business_profiles")
        .select("id", { count: "exact", head: true })
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      const { checkWhatsAppTokenExpiry } = await import("@/lib/whatsapp-token-check");
      const tokenCheck = await checkWhatsAppTokenExpiry();

      const parts: string[] = ["*Stroby Daily Digest*\n"];
      if (tokenCheck.daysRemaining != null && tokenCheck.daysRemaining < 14) {
        parts.push(`⚠️ WhatsApp token expires in ${tokenCheck.daysRemaining} day${tokenCheck.daysRemaining !== 1 ? "s" : ""} — renew it`);
      }
      if ((pendingVerifications || 0) > 0) parts.push(`🔍 ${pendingVerifications} verification${(pendingVerifications || 0) !== 1 ? "s" : ""} pending review`);
      if ((flaggedCount || 0) > 0) parts.push(`🚩 ${flaggedCount} flagged message${(flaggedCount || 0) !== 1 ? "s" : ""} to review`);
      parts.push(`📊 ${matchesSuggested} match${matchesSuggested !== 1 ? "es" : ""} suggested today`);
      if ((newSignups || 0) + (newBiz || 0) > 0) parts.push(`👤 ${(newSignups || 0) + (newBiz || 0)} new signup${(newSignups || 0) + (newBiz || 0) !== 1 ? "s" : ""} (${newSignups || 0} creators, ${newBiz || 0} brands)`);
      parts.push(`\nCheck details: ${process.env.NEXT_PUBLIC_APP_URL || "https://stroby.ai"}/admin`);

      const { sendWhatsAppMessage: sendMsg } = await import("@/lib/whatsapp");
      await sendMsg(adminPhone, parts.join("\n"));
    }
  } catch (err) {
    console.error("Admin digest error:", err);
  }

  return Response.json({ businessesProcessed, matchesSuggested, dripsSent, followupsSent, recapsSent, graphRecompute });
}
