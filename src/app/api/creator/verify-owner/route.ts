import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const { slug, phone } = await request.json();
  if (!slug || !phone) {
    return Response.json({ verified: false, error: "Missing slug or phone" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const cleanPhone = phone.replace(/[\s\-()]/g, "");

  // Check newsletter_profiles
  const { data: nl } = await supabase
    .from("newsletter_profiles")
    .select("id")
    .eq("slug", slug)
    .or(`phone.eq.${cleanPhone},phone.eq.+${cleanPhone}`)
    .maybeSingle();

  if (nl) return Response.json({ verified: true });

  // Check other_profiles
  const { data: other } = await supabase
    .from("other_profiles")
    .select("id")
    .eq("slug", slug)
    .or(`phone.eq.${cleanPhone},phone.eq.+${cleanPhone}`)
    .maybeSingle();

  if (other) return Response.json({ verified: true });

  return Response.json({ verified: false });
}
