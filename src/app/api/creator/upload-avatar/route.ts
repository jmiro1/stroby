import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { cleanPhoneStrict, phoneOrFilter } from "@/lib/phone";
import crypto from "crypto";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const slug = formData.get("slug") as string | null;
  const phoneRaw = formData.get("phone") as string | null;

  if (!file || !slug || !phoneRaw) {
    return Response.json({ error: "Missing file, slug, or phone" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return Response.json({ error: "Please upload a PNG, JPEG, or WebP image." }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return Response.json({ error: "Image too large — max 5MB." }, { status: 400 });
  }

  // Strict digit-only phone, length-validated. Prevents PostgREST .or()
  // filter injection (a comma in the phone would let the attacker append
  // arbitrary OR clauses and match any profile).
  const cleanPhone = cleanPhoneStrict(phoneRaw);
  if (!cleanPhone) {
    return Response.json({ error: "Invalid phone number." }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Verify ownership
  const { data: nl } = await supabase
    .from("newsletter_profiles")
    .select("id")
    .eq("slug", slug)
    .or(phoneOrFilter(cleanPhone))
    .maybeSingle();

  const { data: other } = !nl
    ? await supabase.from("other_profiles").select("id").eq("slug", slug)
        .or(phoneOrFilter(cleanPhone)).maybeSingle()
    : { data: null };

  const profileId = nl?.id || other?.id;
  const table = nl ? "newsletter_profiles" : other ? "other_profiles" : null;

  if (!profileId || !table) {
    return Response.json({ error: "Profile not found or phone doesn't match." }, { status: 403 });
  }

  // Upload to Supabase Storage
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop() || "png";
  const hash = crypto.randomBytes(6).toString("hex");
  const filename = `avatars/${profileId}/${hash}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("proof-screenshots")
    .upload(filename, buffer, { contentType: file.type, upsert: true });

  let avatarUrl: string;

  if (uploadError) {
    // If storage fails, use a data URL (small images only)
    if (buffer.length < 500 * 1024) {
      avatarUrl = `data:${file.type};base64,${buffer.toString("base64")}`;
    } else {
      return Response.json({ error: "Upload failed." }, { status: 500 });
    }
  } else {
    const { data: urlData } = supabase.storage
      .from("proof-screenshots")
      .getPublicUrl(filename);
    avatarUrl = urlData.publicUrl;
  }

  // Update profile
  await supabase.from(table).update({ avatar_url: avatarUrl }).eq("id", profileId);

  return Response.json({ success: true, avatarUrl });
}
