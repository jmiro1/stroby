import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { newsletterId, screenshotUrl } = body;

    if (!newsletterId || !screenshotUrl) {
      return Response.json(
        { error: "Missing newsletterId or screenshotUrl" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Fetch the newsletter profile
    const { data: profile, error: fetchError } = await supabase
      .from("newsletter_profiles")
      .select("id, phone")
      .eq("id", newsletterId)
      .single();

    if (fetchError || !profile) {
      return Response.json(
        { error: "Newsletter profile not found" },
        { status: 404 }
      );
    }

    // Update verification status with screenshot
    const { error: updateError } = await supabase
      .from("newsletter_profiles")
      .update({
        verification_status: "screenshot",
        verification_data: {
          screenshot_url: screenshotUrl,
          verified_at: new Date().toISOString(),
        },
      })
      .eq("id", newsletterId);

    if (updateError) {
      console.error("Supabase update error:", updateError);
      return Response.json(
        { error: "Failed to update newsletter profile" },
        { status: 500 }
      );
    }

    // Send WhatsApp notification
    if (profile.phone) {
      await sendWhatsAppMessage(
        profile.phone,
        "Thanks for uploading your analytics screenshot! We've recorded it for verification."
      );
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error("Screenshot verify API error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
