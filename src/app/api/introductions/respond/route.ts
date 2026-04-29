import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { sendWhatsAppMessage, sendWhatsAppSmart } from "@/lib/whatsapp";
import { getStripe } from "@/lib/stripe";
import { updateUserInsights } from "@/lib/user-insights";
import { verifyInternalBody, INTERNAL_SIG_HEADER } from "@/lib/internal-sig";

// Phase 2/4: log every state transition into match_decisions so the
// memory layer (Phase 4 — last-N-decisions injected into rerank prompt)
// has data to read. Failure here is intentionally non-blocking — we
// never want logging to take down the actual state transition.
//
// 2026-04-29: extended to log other_profiles decisions too. The FK on
// match_decisions.creator_id has been dropped (multi-source support);
// we persist creator_type alongside so the rerank join can find the
// correct row in either source.
async function logMatchDecision(
  supabase: ReturnType<typeof createServiceClient>,
  args: {
    creatorId: string;
    creatorType: string;
    brandId: string;
    decision: "brand_yes" | "brand_no" | "creator_yes" | "creator_no" | "introduced";
    decidedBy: "creator" | "brand" | "system";
    matchScore: number | null;
    introId: string;
    reason?: string | null;
  }
): Promise<void> {
  const creatorType = args.creatorType === "other" ? "other" : "newsletter";
  try {
    await supabase.from("match_decisions").insert({
      creator_id: args.creatorId,
      creator_type: creatorType,
      brand_id: args.brandId,
      decision: args.decision,
      decided_by: args.decidedBy,
      source: "whatsapp",
      match_score: args.matchScore,
      reason: args.reason || null,
      metadata: { introduction_id: args.introId },
    });
  } catch (e) {
    console.error(`match_decisions log (${args.decision}) failed:`, e);
  }
}

// Helper to get creator profile from either table
async function getCreatorProfile(
  supabase: ReturnType<typeof createServiceClient>,
  intro: Record<string, unknown>
): Promise<{ profile: Record<string, unknown>; type: "newsletter" | "other"; name: string; phone: string | null } | null> {
  const creatorType = intro.creator_type as string | null;
  const creatorId = intro.creator_id as string | null;

  // Try new creator_id/creator_type first, fall back to newsletter_id
  if (creatorType === "other" && creatorId) {
    const { data } = await supabase
      .from("other_profiles")
      .select("*")
      .eq("id", creatorId)
      .single();
    if (data) {
      return { profile: data, type: "other", name: data.name, phone: data.phone };
    }
  }

  // Newsletter — use newsletter_id (or creator_id if type is newsletter)
  const nlId = (intro.newsletter_id || creatorId) as string | null;
  if (nlId) {
    const { data } = await supabase
      .from("newsletter_profiles")
      .select("*")
      .eq("id", nlId)
      .single();
    if (data) {
      return { profile: data, type: "newsletter", name: data.newsletter_name || data.owner_name, phone: data.phone };
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  // Verify HMAC signature — this endpoint is server-to-server only.
  // Without this, anyone with valid UUIDs could forge accept/decline.
  const rawBody = await request.text();
  const signature = request.headers.get(INTERNAL_SIG_HEADER);
  if (!verifyInternalBody(rawBody, signature)) {
    return new Response("Forbidden", { status: 403 });
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    introductionId,
    responderId,
    responderType,
    response,
  }: {
    introductionId: string;
    responderId: string;
    responderType: "business" | "newsletter" | "other";
    response: "accept" | "decline" | "tell_me_more";
  } = body;

  if (!introductionId || !responderId || !responderType || !response) {
    return Response.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  // Fetch the introduction
  const { data: intro, error: introError } = await supabase
    .from("introductions")
    .select("*, business_profiles(*)")
    .eq("id", introductionId)
    .single();

  if (introError || !intro) {
    return Response.json(
      { error: "Introduction not found" },
      { status: 404 }
    );
  }

  const business = intro.business_profiles as Record<string, unknown>;

  // Get the creator profile (newsletter or other)
  const creator = await getCreatorProfile(supabase, intro);
  if (!creator) {
    return Response.json({ error: "Creator profile not found" }, { status: 404 });
  }

  let newStatus = intro.status as string;
  const creatorLabel = creator.type === "newsletter" ? "newsletter owner" : "creator";

  // --- BUSINESS RESPONDS ---
  if (responderType === "business") {
    if (response === "accept") {
      newStatus = "business_accepted";
      await supabase
        .from("introductions")
        .update({
          status: "business_accepted",
          business_response_at: new Date().toISOString(),
        })
        .eq("id", introductionId);

      await logMatchDecision(supabase, {
        creatorId: creator.profile.id as string,
        creatorType: creator.type,
        brandId: business.id as string,
        decision: "brand_yes",
        decidedBy: "brand",
        matchScore: (intro.match_score as number) ?? null,
        introId: introductionId,
      });

      await updateUserInsights(business.id as string, "business", {
        type: "match_accepted",
        niche: (creator.profile.primary_niche || creator.profile.niche || "Unknown") as string,
        score: intro.match_score as number,
      });

      // Send WhatsApp to creator asking if they want the intro
      if (creator.phone) {
        let creatorMessage: string;

        if (creator.type === "newsletter") {
          const nl = creator.profile;
          const priceDisplay = nl.price_per_placement
            ? `$${((nl.price_per_placement as number) / 100).toFixed(0)}`
            : "TBD";

          creatorMessage = `Hi ${nl.owner_name || creator.name}! A business wants to sponsor your newsletter:\n\n🏢 ${business.company_name}\n🎯 Niche: ${business.primary_niche || "General"}\n📝 ${business.product_description || "N/A"}\n👤 Target: ${business.target_customer || "N/A"}\n💰 Your rate: ${priceDisplay} per placement\n\nMatch score: ${((intro.match_score as number) * 100).toFixed(0)}%\nWhy: ${intro.match_reasoning}\n\nWant me to connect you? Reply YES, NO, or TELL ME MORE.`;
        } else {
          creatorMessage = `Hi ${creator.name}! A business wants to partner with you:\n\n🏢 ${business.company_name}\n🎯 Niche: ${business.primary_niche || "General"}\n📝 ${business.product_description || "N/A"}\n👤 Target: ${business.target_customer || "N/A"}\n\nMatch score: ${((intro.match_score as number) * 100).toFixed(0)}%\nWhy: ${intro.match_reasoning}\n\nWant me to connect you? Reply YES, NO, or TELL ME MORE.`;
        }

        const matchContext = `🏢 ${business.company_name}\n🎯 ${business.primary_niche || "General"}\n📝 ${business.product_description || "N/A"}\nMatch score: ${((intro.match_score as number) * 100).toFixed(0)}%\nWhy: ${intro.match_reasoning}`;
        const messageSid = await sendWhatsAppSmart(creator.phone, creatorMessage, "match_confirmation", [creator.name, matchContext]);

        await supabase.from("agent_messages").insert({
          direction: "outbound",
          user_type: creator.type,
          user_id: creator.profile.id,
          phone: creator.phone,
          content: creatorMessage,
          message_type: "intro_request",
          related_introduction_id: introductionId,
          external_id: messageSid,
        });
      }
    } else if (response === "decline") {
      newStatus = "business_declined";
      await supabase
        .from("introductions")
        .update({
          status: "business_declined",
          business_response_at: new Date().toISOString(),
          declined_by: "business",
        })
        .eq("id", introductionId);

      await logMatchDecision(supabase, {
        creatorId: creator.profile.id as string,
        creatorType: creator.type,
        brandId: business.id as string,
        decision: "brand_no",
        decidedBy: "brand",
        matchScore: (intro.match_score as number) ?? null,
        introId: introductionId,
      });

      await updateUserInsights(business.id as string, "business", {
        type: "match_declined",
        niche: (creator.profile.primary_niche || creator.profile.niche || "Unknown") as string,
        score: intro.match_score as number,
      });

      // Mark business as awaiting a free-form decline reason — next inbound
      // message gets captured as `decline_reason` on this introduction.
      await supabase
        .from("business_profiles")
        .update({ awaiting_decline_reason_intro_id: introductionId })
        .eq("id", business.id as string);

      if (business.phone) {
        const declineMsg =
          "No worries! Quick favor — what made this one not a fit? Just one line helps me send you better matches next time. (Or reply 'skip' to pass.)";
        const messageSid = await sendWhatsAppMessage(
          business.phone as string,
          declineMsg
        );

        await supabase.from("agent_messages").insert({
          direction: "outbound",
          user_type: "business",
          user_id: business.id,
          phone: business.phone,
          content: declineMsg,
          message_type: "decline_ack",
          related_introduction_id: introductionId,
          external_id: messageSid,
        });
      }
    } else if (response === "tell_me_more") {
      if (business.phone) {
        let detailMsg: string;

        if (creator.type === "newsletter") {
          const nl = creator.profile;
          detailMsg = `Here's more about ${nl.newsletter_name}:\n\n📰 Niche: ${nl.primary_niche || "General"}\n📝 ${nl.description || "No description available"}\n👥 ${nl.subscriber_count || "N/A"} subscribers\n📊 ${nl.avg_open_rate || "N/A"}% open rate | ${nl.avg_ctr || "N/A"}% CTR\n✅ API verified: ${nl.api_verified ? "Yes" : "No"}\n⭐ Avg rating: ${nl.avg_match_rating || "New"}\n\nWould you like me to introduce you? Reply YES or NO.`;
        } else {
          const cr = creator.profile;
          detailMsg = `Here's more about ${cr.name}:\n\n🎨 Role: ${cr.role || "N/A"}\n🏢 Organization: ${cr.organization || "N/A"}\n📝 ${cr.description || "No description available"}\n💡 What they offer: ${cr.can_offer || "N/A"}\n🎯 Looking for: ${cr.looking_for || "N/A"}\n🌐 Website: ${cr.website || "N/A"}\n⭐ Avg rating: ${cr.avg_match_rating || "New"}\n\nWould you like me to introduce you? Reply YES or NO.`;
        }

        const messageSid = await sendWhatsAppMessage(
          business.phone as string,
          detailMsg
        );

        await supabase.from("agent_messages").insert({
          direction: "outbound",
          user_type: "business",
          user_id: business.id,
          phone: business.phone,
          content: detailMsg,
          message_type: "match_details",
          related_introduction_id: introductionId,
          external_id: messageSid,
        });
      }
    }
  }

  // --- CREATOR RESPONDS (newsletter or other) ---
  if (responderType === "newsletter" || responderType === "other") {
    if (response === "accept") {
      newStatus = "newsletter_accepted";
      await supabase
        .from("introductions")
        .update({
          status: "newsletter_accepted",
          newsletter_response_at: new Date().toISOString(),
        })
        .eq("id", introductionId);

      await logMatchDecision(supabase, {
        creatorId: creator.profile.id as string,
        creatorType: creator.type,
        brandId: business.id as string,
        decision: "creator_yes",
        decidedBy: "creator",
        matchScore: (intro.match_score as number) ?? null,
        introId: introductionId,
      });

      await updateUserInsights(creator.profile.id as string, creator.type, {
        type: "match_accepted",
        niche: (business.primary_niche || "Unknown") as string,
        score: intro.match_score as number,
      });

      // Check if double opt-in is complete
      if (intro.status === "business_accepted") {
        newStatus = "introduced";
        await supabase
          .from("introductions")
          .update({
            status: "introduced",
            introduced_at: new Date().toISOString(),
            introduction_method: "whatsapp_group",
          })
          .eq("id", introductionId);

        await logMatchDecision(supabase, {
          creatorId: creator.profile.id as string,
          creatorType: creator.type,
          brandId: business.id as string,
          decision: "introduced",
          decidedBy: "system",
          matchScore: (intro.match_score as number) ?? null,
          introId: introductionId,
        });

        const introMessage = `Hey, Stroby here! Great news — I've connected you both. ${business.contact_name || business.company_name}, meet ${creator.name}. ${creator.name}, meet ${business.contact_name || business.company_name} (${business.company_name}). You two should discuss partnership details, timing, and creative.\n\nYou can work out the deal directly, or if you'd like Stroby to handle payment as a secure escrow (protecting both sides), just let me know!\n\n— Connected by Stroby ✨`;

        // Message to business
        if (business.phone) {
          const bizSid = await sendWhatsAppMessage(
            business.phone as string,
            introMessage
          );
          await supabase.from("agent_messages").insert({
            direction: "outbound",
            user_type: "business",
            user_id: business.id,
            phone: business.phone,
            content: introMessage,
            message_type: "introduction_made",
            related_introduction_id: introductionId,
            external_id: bizSid,
          });
        }

        // Message to creator
        if (creator.phone) {
          const crSid = await sendWhatsAppMessage(creator.phone, introMessage);
          await supabase.from("agent_messages").insert({
            direction: "outbound",
            user_type: creator.type,
            user_id: creator.profile.id,
            phone: creator.phone,
            content: introMessage,
            message_type: "introduction_made",
            related_introduction_id: introductionId,
            external_id: crSid,
          });
        }

        // Auto-generate Stripe Connect link for newsletter creators who haven't connected yet
        if (creator.type === "newsletter" && !creator.profile.stripe_account_id && creator.phone) {
          try {
            const stripe = getStripe();
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://stroby.ai";
            const creatorId = creator.profile.id as string;

            // Create Express account
            const account = await stripe.accounts.create({
              type: "express",
              email: (creator.profile.email as string) || undefined,
              metadata: { profile_id: creatorId },
            });

            // Save account ID
            await supabase
              .from("newsletter_profiles")
              .update({ stripe_account_id: account.id })
              .eq("id", creatorId);

            // Generate onboarding link
            const accountLink = await stripe.accountLinks.create({
              account: account.id,
              refresh_url: `${appUrl}/stripe/connect?refresh=true&id=${creatorId}`,
              return_url: `${appUrl}/stripe/connect/complete?id=${creatorId}`,
              type: "account_onboarding",
            });

            const stripeMsg = `One more thing — if you'd like Stroby to handle the payment securely (escrow protects both sides), here's your setup link:\n\n${accountLink.url}\n\nThis is optional! You can also work out payment directly with ${business.contact_name || business.company_name}.`;

            const stripeSid = await sendWhatsAppMessage(creator.phone, stripeMsg);
            await supabase.from("agent_messages").insert({
              direction: "outbound",
              user_type: "newsletter",
              user_id: creatorId,
              phone: creator.phone,
              content: stripeMsg,
              message_type: "stripe_connect",
              related_introduction_id: introductionId,
              external_id: stripeSid,
            });
          } catch (err) {
            console.error("Failed to generate Stripe Connect link:", err);
          }
        }

        // Send referral prompt to both parties (after successful intro)
        const referralMsg = `By the way — know someone who'd be great on Stroby? Forward them this message:\n\n"Hey! I'm using Stroby to find brand partnerships through WhatsApp. It's free and the AI finds you matches automatically. Try it: https://wa.me/message/2QFL7QR7EBZTD1"`;

        if (business.phone) {
          await sendWhatsAppMessage(business.phone as string, referralMsg);
        }
        if (creator.phone) {
          await sendWhatsAppMessage(creator.phone, referralMsg);
        }
      }
    } else if (response === "decline") {
      newStatus = "newsletter_declined";
      await supabase
        .from("introductions")
        .update({
          status: "newsletter_declined",
          newsletter_response_at: new Date().toISOString(),
          declined_by: creator.type === "newsletter" ? "newsletter" : "other",
        })
        .eq("id", introductionId);

      await logMatchDecision(supabase, {
        creatorId: creator.profile.id as string,
        creatorType: creator.type,
        brandId: business.id as string,
        decision: "creator_no",
        decidedBy: "creator",
        matchScore: (intro.match_score as number) ?? null,
        introId: introductionId,
      });

      await updateUserInsights(creator.profile.id as string, creator.type, {
        type: "match_declined",
        niche: (business.primary_niche || "Unknown") as string,
        score: intro.match_score as number,
      });

      // Flag the creator as awaiting a free-form decline reason. Webhook
      // will pick up the next message as the reason.
      const creatorTable =
        creator.type === "newsletter" ? "newsletter_profiles" : "other_profiles";
      await supabase
        .from(creatorTable)
        .update({ awaiting_decline_reason_intro_id: introductionId })
        .eq("id", creator.profile.id as string);

      if (creator.phone) {
        const ackMsg =
          "No problem! Quick question — what made this one not a fit? Just one line helps me only send you great matches. (Or reply 'skip' to pass.)";
        const crSid = await sendWhatsAppMessage(creator.phone, ackMsg);
        await supabase.from("agent_messages").insert({
          direction: "outbound",
          user_type: creator.type,
          user_id: creator.profile.id,
          phone: creator.phone,
          content: ackMsg,
          message_type: "decline_ack",
          related_introduction_id: introductionId,
          external_id: crSid,
        });
      }

      if (business.phone) {
        const bizNotifyMsg = `The ${creatorLabel} wasn't available this time. I'll find other matches for you.`;
        const bizSid = await sendWhatsAppMessage(
          business.phone as string,
          bizNotifyMsg
        );
        await supabase.from("agent_messages").insert({
          direction: "outbound",
          user_type: "business",
          user_id: business.id,
          phone: business.phone,
          content: bizNotifyMsg,
          message_type: "newsletter_declined_notify",
          related_introduction_id: introductionId,
          external_id: bizSid,
        });
      }
    } else if (response === "tell_me_more") {
      if (creator.phone) {
        const detailMsg = `Here's more about ${business.company_name}:\n\n🏢 Company: ${business.company_name}\n📝 Product: ${business.product_description || "N/A"}\n👤 Target customer: ${business.target_customer || "N/A"}\n🎯 Campaign goal: ${business.campaign_goal || "N/A"}\n💰 Budget range: ${business.budget_range || "N/A"}\n📋 Description: ${business.description || "N/A"}\n\nWould you like me to connect you? Reply YES or NO.`;

        const messageSid = await sendWhatsAppMessage(creator.phone, detailMsg);

        await supabase.from("agent_messages").insert({
          direction: "outbound",
          user_type: creator.type,
          user_id: creator.profile.id,
          phone: creator.phone,
          content: detailMsg,
          message_type: "match_details",
          related_introduction_id: introductionId,
          external_id: messageSid,
        });
      }
    }
  }

  return Response.json({ success: true, newStatus });
}
