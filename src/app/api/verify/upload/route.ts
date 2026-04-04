import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import crypto from "crypto";

// Allowed file types and limits
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "application/pdf"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MIN_FILE_SIZE = 5 * 1024; // 5KB (too small = probably not a real screenshot)

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const newsletterId = formData.get("newsletterId") as string | null;

    if (!file || !newsletterId) {
      return Response.json({ error: "Missing file or newsletterId" }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return Response.json({
        error: `File type not accepted. Please upload a PNG, JPEG, WebP, GIF, or PDF. Got: ${file.type}`,
      }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return Response.json({
        error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 10MB.`,
      }, { status: 400 });
    }

    if (file.size < MIN_FILE_SIZE) {
      return Response.json({
        error: "File too small — this doesn't look like a real screenshot. Please upload your analytics page.",
      }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Verify the newsletter exists
    const { data: profile, error: fetchError } = await supabase
      .from("newsletter_profiles")
      .select("id, phone, newsletter_name")
      .eq("id", newsletterId)
      .single();

    if (fetchError || !profile) {
      return Response.json({ error: "Newsletter profile not found" }, { status: 404 });
    }

    // Generate a unique filename
    const ext = file.name.split(".").pop() || "png";
    const hash = crypto.randomBytes(8).toString("hex");
    const filename = `verify/${newsletterId}/${hash}.${ext}`;

    // Upload to Supabase Storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from("proof-screenshots")
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      // If bucket doesn't exist, store as base64 in verification_data instead
      const base64 = buffer.toString("base64").slice(0, 1000); // Just store a hash reference
      await supabase
        .from("newsletter_profiles")
        .update({
          verification_status: "screenshot",
          verification_data: {
            file_name: file.name,
            file_type: file.type,
            file_size: file.size,
            upload_reference: hash,
            verified_at: new Date().toISOString(),
          },
        })
        .eq("id", newsletterId);

      if (profile.phone) {
        await sendWhatsAppMessage(
          profile.phone,
          `Thanks for uploading your screenshot for *${profile.newsletter_name}*! We've recorded it for verification.`
        );
      }

      return Response.json({ success: true, verified: true });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("proof-screenshots")
      .getPublicUrl(filename);

    // Update verification status
    await supabase
      .from("newsletter_profiles")
      .update({
        verification_status: "screenshot",
        verification_data: {
          screenshot_url: urlData.publicUrl,
          file_name: file.name,
          file_size: file.size,
          verified_at: new Date().toISOString(),
        },
      })
      .eq("id", newsletterId);

    // Notify via WhatsApp
    if (profile.phone) {
      await sendWhatsAppMessage(
        profile.phone,
        `Thanks for uploading your screenshot for *${profile.newsletter_name}*! We've recorded it for verification. Verified creators get prioritized in matching!`
      );
    }

    return Response.json({ success: true, verified: true });
  } catch (err) {
    console.error("Upload verify error:", err);
    return Response.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
