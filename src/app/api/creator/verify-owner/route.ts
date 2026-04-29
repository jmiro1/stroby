import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { cleanPhoneStrict, phoneOrFilter } from "@/lib/phone";

export async function POST(request: NextRequest) {
  const { slug, phone } = await request.json();
  if (!slug || !phone) {
    return Response.json({ verified: false, error: "Missing slug or phone" }, { status: 400 });
  }

  // Strict digit-only phone — prevents PostgREST .or() filter injection.
  const cleanPhone = cleanPhoneStrict(phone);
  if (!cleanPhone) {
    return Response.json({ verified: false, error: "Invalid phone" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: nl } = await supabase
    .from("newsletter_profiles")
    .select("id")
    .eq("slug", slug)
    .or(phoneOrFilter(cleanPhone))
    .maybeSingle();

  if (nl) return Response.json({ verified: true });

  const { data: other } = await supabase
    .from("other_profiles")
    .select("id")
    .eq("slug", slug)
    .or(phoneOrFilter(cleanPhone))
    .maybeSingle();

  if (other) return Response.json({ verified: true });

  return Response.json({ verified: false });
}
