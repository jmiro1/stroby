import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { cleanPhoneStrict, phoneOrFilter } from "@/lib/phone";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { id, phone } = body;

  if (!id && !phone) {
    return Response.json({ error: "Missing id or phone" }, { status: 400 });
  }

  // Validate id format if present (must be a UUID — prevents .eq() injection)
  if (id && (typeof id !== "string" || !UUID_RE.test(id))) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  // Strict digit-only phone if present — prevents PostgREST .or() filter injection.
  let cleanPhone: string | null = null;
  if (phone) {
    cleanPhone = cleanPhoneStrict(phone);
    if (!cleanPhone) {
      return Response.json({ error: "Invalid phone" }, { status: 400 });
    }
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
    } else if (cleanPhone) {
      query = query.or(phoneOrFilter(cleanPhone));
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
