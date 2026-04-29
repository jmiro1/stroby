import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { findMatchesForBusiness } from "@/lib/matching";
import { sendWhatsAppSmart } from "@/lib/whatsapp";
import { updateUserInsights } from "@/lib/user-insights";
import { sendEngagementDrips, sendPostIntroFollowups, sendMonthlyRecaps } from "@/lib/engagement-drips";
import { generateVoiceMessage, isVoiceEnabled } from "@/lib/tts";
import { uploadWhatsAppAudio, sendWhatsAppAudio } from "@/lib/whatsapp";

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
      if (match.creatorType === "newsletter") {
        try {
          await supabase.from("match_decisions").insert({
            creator_id: match.creatorId,
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

      if (match.creatorType === "newsletter" && match.newsletter) {
        const nl = match.newsletter;
        const priceDisplay = nl.price_per_placement
          ? `$${(nl.price_per_placement / 100).toFixed(0)}`
          : "TBD";

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://stroby.ai";
        const profileLink = nl.slug ? `\n\n🔗 See their profile: ${appUrl}/creator/${nl.slug}` : "";
        messageBody = `Hey, Stroby here! I found a newsletter that looks like a great fit for ${business.company_name}:\n\n📰 ${nl.newsletter_name}\n🎯 Niche: ${nl.primary_niche || "General"}\n👥 ${nl.subscriber_count || "N/A"} subscribers | ${nl.avg_open_rate || "N/A"}% open rate\n💰 ${priceDisplay} per placement\n\nWhy it's a match: ${match.reasoning}${profileLink}\n\nWant me to introduce you? Reply YES, NO, or TELL ME MORE.`;
      } else if (match.otherProfile) {
        const cr = match.otherProfile;
        messageBody = `Hey, Stroby here! I found a creator who could be a great partner for ${business.company_name}:\n\n🎨 ${cr.name}${cr.role ? ` (${cr.role})` : ""}${cr.organization ? ` at ${cr.organization}` : ""}\n🎯 Niche: ${cr.niche || "General"}\n📝 ${cr.description || "N/A"}\n💡 What they offer: ${cr.can_offer || "N/A"}\n\nWhy it's a match: ${match.reasoning}\n\nWant me to introduce you? Reply YES, NO, or TELL ME MORE.`;
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

      const messageSid = await sendWhatsAppSmart(
        business.phone,
        messageBody,
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

  return Response.json({ businessesProcessed, matchesSuggested, dripsSent, followupsSent, recapsSent });
}
