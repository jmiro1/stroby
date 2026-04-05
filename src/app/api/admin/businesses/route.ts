import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword || key !== adminPassword) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: businesses } = await supabase
    .from("business_profiles")
    .select("id, company_name, primary_niche, contact_name, partner_preference, onboarding_status")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  return Response.json({ businesses: businesses || [] });
}
