import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";

// Public endpoint — returns anonymized niche counts for social proof
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const niche = url.searchParams.get("niche");
  const userType = url.searchParams.get("type"); // "business" or "creator"

  if (!niche) {
    return Response.json({ count: 0 });
  }

  const supabase = createServiceClient();

  if (userType === "business") {
    // Business wants to know how many creators are in this niche
    const [{ count: nlCount }, { count: otherCount }] = await Promise.all([
      supabase.from("newsletter_profiles").select("id", { count: "exact", head: true }).eq("primary_niche", niche).eq("is_active", true),
      supabase.from("other_profiles").select("id", { count: "exact", head: true }).eq("niche", niche).eq("is_active", true),
    ]);
    const total = (nlCount || 0) + (otherCount || 0);

    // Also count competing businesses
    const { count: bizCount } = await supabase
      .from("business_profiles").select("id", { count: "exact", head: true }).eq("primary_niche", niche).eq("is_active", true);

    return Response.json({ creators: total, businesses: bizCount || 0 });
  }

  // Creator wants to know how many businesses are in this niche
  const { count: bizCount } = await supabase
    .from("business_profiles").select("id", { count: "exact", head: true }).eq("primary_niche", niche).eq("is_active", true);

  const { count: totalUsers } = await supabase
    .from("newsletter_profiles").select("id", { count: "exact", head: true }).eq("is_active", true);

  return Response.json({ businesses: bizCount || 0, totalCreators: totalUsers || 0 });
}
