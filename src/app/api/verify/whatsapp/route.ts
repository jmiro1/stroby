import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { id, phone } = body;

  if (!id && !phone) {
    return Response.json({ error: "Missing id or phone" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Search across all profile tables
  const tables = [
    { name: "newsletter_profiles", type: "newsletter" },
    { name: "business_profiles", type: "business" },
    { name: "other_profiles", type: "other" },
  ] as const;

  for (const table of tables) {
    let query = supabase.from(table.name).select("id, onboarding_status");

    if (id) {
      query = query.eq("id", id);
    } else if (phone) {
      const cleanPhone = phone.replace(/[\s\-()]/g, "");
      query = query.or(`phone.eq.${cleanPhone},phone.eq.+${cleanPhone}`);
    }

    const { data } = await query.maybeSingle();

    if (data) {
      const already = data.onboarding_status === "whatsapp_active" ||
        data.onboarding_status === "fully_onboarded" ||
        data.onboarding_status === "verified" ||
        data.onboarding_status === "stripe_connected";

      if (!already) {
        await supabase
          .from(table.name)
          .update({ onboarding_status: "whatsapp_active" })
          .eq("id", data.id);
      }

      return Response.json({
        success: true,
        userId: data.id,
        userType: table.type,
        already,
      });
    }
  }

  // No profile found — still return success (the click itself is valuable)
  return Response.json({ success: true, userId: null, userType: null, already: false });
}
