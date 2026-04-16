import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { resolveAttribution } from "@/lib/affiliates/attribution";
import { AFFILIATE_CONFIG } from "@/lib/affiliates/config";
import type { ReferralRole } from "@/lib/affiliates/types";

/**
 * Helper: extract affiliate attribution inputs from the inbound request.
 * - Reads the stroby_aff cookie (if set by /r/[code])
 * - Reads any signup code passed in body.data.affiliate_code
 */
function extractAttributionInputs(request: NextRequest, body: { data?: { affiliate_code?: string; email?: string } }) {
  const cookieValue = request.cookies.get(AFFILIATE_CONFIG.REFERRAL_COOKIE_NAME)?.value;
  return {
    cookieAffiliateId: cookieValue || null,
    signupCode: body.data?.affiliate_code || null,
    ipHash: null as string | null,
    userAgent: request.headers.get("user-agent"),
  };
}

async function attributeProfile(
  request: NextRequest,
  body: { data?: { affiliate_code?: string; email?: string } },
  profileType: ReferralRole,
  profileId: string,
  email: string,
): Promise<void> {
  try {
    const inputs = extractAttributionInputs(request, body);
    await resolveAttribution({
      profileType,
      profileId,
      email: email.toLowerCase(),
      ...inputs,
    });
  } catch (e) {
    // Affiliate attribution must NEVER block onboarding
    console.error("affiliate attribution failed:", e);
  }
}

const BUDGET_MAP: Record<string, string> = {
  "<$500": "<500",
  "$500-$1k": "500-1000",
  "$1k-$2.5k": "1000-2500",
  "$2.5k-$5k": "2500-5000",
  "$5k+": "5000+",
  "Flexible / varies": "flexible",
};

const PARTNER_PREF_MAP: Record<string, string> = {
  "Newsletters only": "newsletters_only",
  "Influencers & creators only": "creators_only",
  "All — newsletters and influencers": "all",
};

const GOAL_MAP: Record<string, string> = {
  "Brand awareness": "brand_awareness",
  "Direct response / clicks": "direct_response",
  "Lead generation": "lead_generation",
};

const OUTCOME_MAP: Record<string, string> = {
  "Reach — maximum eyeballs": "reach",
  "Engagement — comments, shares, interaction": "engagement",
  "Conversions — clicks, signups, sales": "conversions",
  "Credibility — association with a trusted voice": "credibility",
};

const SIZE_MAP: Record<string, string> = {
  "Micro (under 10k)": "micro",
  "Mid-tier (10k–100k)": "mid",
  "Macro (100k+)": "macro",
  "No preference": "any",
};

const PLATFORM_MAP: Record<string, string> = {
  Newsletter: "newsletter",
  YouTube: "youtube",
  Instagram: "instagram",
  TikTok: "tiktok",
  Podcast: "podcast",
  Blog: "blog",
  LinkedIn: "linkedin",
  "X / Twitter": "twitter",
  Other: "other",
};

const TIMELINE_MAP: Record<string, string> = {
  ASAP: "asap",
  "This month": "this_month",
  Exploring: "exploring",
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userType, data } = body;

    if (!userType || !data) {
      return Response.json(
        { error: "Missing userType or data" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Check for duplicate email across all profile tables
    if (data.email) {
      const email = data.email.trim().toLowerCase();
      const tables = ["newsletter_profiles", "business_profiles", "other_profiles"] as const;
      for (const table of tables) {
        const { data: existing } = await supabase.from(table).select("id").eq("email", email).maybeSingle();
        if (existing) {
          return Response.json(
            { error: "duplicate_email", message: "An account with this email already exists. Message Stroby on WhatsApp to access your account." },
            { status: 409 }
          );
        }
      }
    }

    // Influencer / newsletter flow
    if (userType === "influencer" || userType === "newsletter") {
      const openRate =
        data.avg_open_rate != null && data.avg_open_rate !== ""
          ? parseFloat(data.avg_open_rate) / 100
          : null;
      const ctr =
        data.avg_ctr != null && data.avg_ctr !== ""
          ? parseFloat(data.avg_ctr) / 100
          : null;

      const priceRaw = data.price_per_placement;
      let priceCents: number | null = null;
      if (priceRaw && priceRaw !== "not sure" && priceRaw !== "not sure yet") {
        const parsed = parseFloat(String(priceRaw).replace(/[$,]/g, ""));
        if (!isNaN(parsed)) priceCents = Math.round(parsed * 100);
      }

      // Resolve niche — if "Other" was selected, use the custom niche
      const niche = data.primary_niche === "Other" && data.custom_niche
        ? data.custom_niche
        : data.primary_niche;

      // Generate slug from name
      const rawName = data.channel_name || data.newsletter_name || "creator";
      const baseSlug = rawName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const slug = baseSlug + "-" + Math.random().toString(36).slice(2, 6);

      const audienceNum = (data.audience_size || data.subscriber_count)
        ? parseInt(String(data.audience_size || data.subscriber_count).replace(/[,\s]/g, ""), 10)
        : null;

      // Parse engagement_rate from free-text (e.g., "42% open rate" → 0.42, "5%" → 0.05)
      let engRateDecimal: number | null = null;
      if (data.engagement_rate) {
        const match = String(data.engagement_rate).match(/(\d+\.?\d*)\s*%/);
        if (match) {
          engRateDecimal = parseFloat(match[1]) / 100;
        }
      }

      const platformValue = PLATFORM_MAP[data.platform] || data.platform?.toLowerCase() || null;

      const { data: profile, error } = await supabase
        .from("newsletter_profiles")
        .insert({
          newsletter_name: data.channel_name || data.newsletter_name,
          slug,
          owner_name: data.owner_name || data.email?.split("@")[0] || "Owner",
          url: data.url || null,
          platform: platformValue,
          primary_niche: niche,
          description: data.description || null,
          subscriber_count: audienceNum,
          audience_reach: audienceNum,
          engagement_rate: engRateDecimal,
          avg_open_rate: openRate,
          avg_ctr: ctr,
          price_per_placement: priceCents,
          ad_formats: data.partnership_types || data.ad_formats || null,
          frequency: data.frequency || null,
          email: data.email,
          phone: data.phone,
          referral_source: data.referral_source || null,
          onboarding_status: "widget_complete",
        })
        .select("id")
        .single();

      if (error) {
        console.error("Supabase insert error (influencer):", JSON.stringify({
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          data_sent: {
            email: data.email,
            phone: data.phone,
            platform: platformValue,
            audience_reach: audienceNum,
            engagement_rate: engRateDecimal,
            primary_niche: niche,
          },
        }));
        return Response.json(
          { error: "Failed to create profile" },
          { status: 500 }
        );
      }

      // Affiliate attribution (best-effort, never blocks onboarding)
      await attributeProfile(request, body, "newsletter", profile.id, data.email);

      return Response.json({ success: true, id: profile.id });
    }

    // Business flow
    if (userType === "business") {
      const niche = data.primary_niche === "Other" && data.custom_niche
        ? data.custom_niche
        : data.primary_niche;

      const { data: profile, error } = await supabase
        .from("business_profiles")
        .insert({
          company_name: data.company_name,
          contact_name: data.contact_name || data.email?.split("@")[0] || "Contact",
          contact_role: data.contact_role || null,
          product_description: data.product_description || null,
          target_customer: data.target_customer || null,
          primary_niche: niche,
          description: data.website_url
            ? `Website: ${data.website_url}${data.description ? ` | ${data.description}` : ""}`
            : data.description || null,
          budget_range: BUDGET_MAP[data.budget_range] ?? data.budget_range ?? null,
          campaign_goal: GOAL_MAP[data.campaign_goal] ?? data.campaign_goal ?? null,
          campaign_outcome: OUTCOME_MAP[data.campaign_outcome] ?? data.campaign_outcome ?? null,
          preferred_creator_type: PARTNER_PREF_MAP[data.partner_preference] === "newsletters_only" ? "newsletter"
            : PARTNER_PREF_MAP[data.partner_preference] === "creators_only" ? "any"
            : "any",
          preferred_creator_size: SIZE_MAP[data.preferred_creator_size] ?? data.preferred_creator_size ?? "any",
          timeline: TIMELINE_MAP[data.timeline] ?? data.timeline ?? null,
          partner_preference: PARTNER_PREF_MAP[data.partner_preference] ?? data.partner_preference ?? "all",
          email: data.email,
          phone: data.phone,
          referral_source: data.referral_source || null,
          onboarding_status: "widget_complete",
        })
        .select("id")
        .single();

      if (error) {
        console.error("Supabase insert error (business):", JSON.stringify({
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          data_sent: {
            company_name: data.company_name,
            email: data.email,
            phone: data.phone,
            budget_range: BUDGET_MAP[data.budget_range] ?? data.budget_range,
            campaign_outcome: OUTCOME_MAP[data.campaign_outcome] ?? data.campaign_outcome,
            preferred_creator_size: SIZE_MAP[data.preferred_creator_size] ?? data.preferred_creator_size,
            partner_preference: PARTNER_PREF_MAP[data.partner_preference] ?? data.partner_preference,
            primary_niche: niche,
          },
        }));
        return Response.json(
          { error: "Failed to create business profile" },
          { status: 500 }
        );
      }

      // Affiliate attribution (best-effort, never blocks onboarding)
      await attributeProfile(request, body, "business", profile.id, data.email);

      return Response.json({ success: true, id: profile.id });
    }

    // "Other" flow — from free-form Claude chat
    if (userType === "other") {
      const { data: profile, error } = await supabase
        .from("other_profiles")
        .insert({
          name: data.name || data.email?.split("@")[0] || "User",
          role: data.role || null,
          organization: data.organization || null,
          location: data.location || null,
          description: data.description || null,
          objectives: data.objectives || null,
          looking_for: data.looking_for || null,
          can_offer: data.can_offer || null,
          niche: data.niche || "Other",
          website: data.website || null,
          linkedin: data.linkedin || null,
          email: data.email || null,
          phone: data.phone || null,
          referral_source: data.referral_source || null,
          onboarding_status: "widget_complete",
        })
        .select("id")
        .single();

      if (error) {
        console.error("Supabase insert error (other):", error);
        return Response.json(
          { error: "Failed to create profile" },
          { status: 500 }
        );
      }

      // Affiliate attribution (best-effort, never blocks onboarding)
      if (data.email) {
        await attributeProfile(request, body, "other", profile.id, data.email);
      }

      return Response.json({ success: true, id: profile.id });
    }

    return Response.json(
      { error: 'Invalid userType.' },
      { status: 400 }
    );
  } catch (err) {
    console.error("Onboard API error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
