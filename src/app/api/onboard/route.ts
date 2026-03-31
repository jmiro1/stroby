import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";

const BUDGET_MAP: Record<string, string> = {
  "<$500": "<500",
  "$500-$1k": "500-1000",
  "$1k-$2.5k": "1000-2500",
  "$2.5k-$5k": "2500-5000",
  "$5k+": "5000+",
};

const GOAL_MAP: Record<string, string> = {
  "Brand awareness": "brand_awareness",
  "Direct response / clicks": "direct_response",
  "Lead generation": "lead_generation",
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

    if (userType === "newsletter") {
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
      if (priceRaw && priceRaw !== "not sure") {
        const parsed = parseFloat(String(priceRaw).replace(/[$,]/g, ""));
        if (!isNaN(parsed)) priceCents = Math.round(parsed * 100);
      }

      const { data: profile, error } = await supabase
        .from("newsletter_profiles")
        .insert({
          newsletter_name: data.newsletter_name,
          owner_name: data.owner_name || data.email?.split("@")[0] || "Owner",
          url: data.url || null,
          primary_niche: data.primary_niche,
          description: data.description || null,
          subscriber_count: data.subscriber_count
            ? parseInt(String(data.subscriber_count), 10)
            : null,
          avg_open_rate: openRate,
          avg_ctr: ctr,
          price_per_placement: priceCents,
          ad_formats: data.ad_formats || null,
          frequency: data.frequency || null,
          email: data.email,
          phone: data.phone,
          onboarding_status: "widget_complete",
        })
        .select("id")
        .single();

      if (error) {
        console.error("Supabase insert error (newsletter):", error);
        return Response.json(
          { error: "Failed to create newsletter profile" },
          { status: 500 }
        );
      }

      return Response.json({ success: true, id: profile.id });
    }

    if (userType === "business") {
      const { data: profile, error } = await supabase
        .from("business_profiles")
        .insert({
          company_name: data.company_name,
          contact_name: data.contact_name || data.email?.split("@")[0] || "Contact",
          contact_role: data.contact_role || null,
          product_description: data.product_description || null,
          target_customer: data.target_customer || null,
          primary_niche: data.primary_niche,
          description: data.description || null,
          budget_range: BUDGET_MAP[data.budget_range] ?? data.budget_range ?? null,
          campaign_goal: GOAL_MAP[data.campaign_goal] ?? data.campaign_goal ?? null,
          timeline: TIMELINE_MAP[data.timeline] ?? data.timeline ?? null,
          email: data.email,
          phone: data.phone,
          onboarding_status: "widget_complete",
        })
        .select("id")
        .single();

      if (error) {
        console.error("Supabase insert error (business):", error);
        return Response.json(
          { error: "Failed to create business profile" },
          { status: 500 }
        );
      }

      return Response.json({ success: true, id: profile.id });
    }

    return Response.json(
      { error: 'Invalid userType. Must be "newsletter" or "business".' },
      { status: 400 }
    );
  } catch (err) {
    console.error("Onboard API error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
