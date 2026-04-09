/**
 * POST /api/affiliates/apply
 *
 * Submit an affiliate application. Creates an `affiliates` row in
 * `pending` status, generates a unique referral code, notifies the
 * admin via WhatsApp.
 *
 * If AFFILIATE_AUTO_APPROVE=true, the application is auto-approved
 * and the welcome WhatsApp is sent immediately. Otherwise it sits in
 * `pending` for an admin to approve at /admin/affiliates.
 */
import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { generateUniqueReferralCode } from "@/lib/affiliates/codes";
import { AFFILIATE_CONFIG } from "@/lib/affiliates/config";
import {
  notifyAdminNewApplication,
  notifyApplicationApproved,
} from "@/lib/affiliates/notify";

interface ApplyBody {
  email?: string;
  full_name?: string;
  phone?: string;
  bio?: string;
  network_description?: string;
  display_name?: string;
}

export async function POST(request: NextRequest) {
  let body: ApplyBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const full_name = (body.full_name ?? "").trim();
  const phone = (body.phone ?? "").trim().replace(/\s+/g, "");
  const network_description = (body.network_description ?? "").trim();
  const bio = (body.bio ?? "").trim();
  const display_name = (body.display_name ?? "").trim() || null;

  // Validation
  if (!email || !email.includes("@")) {
    return Response.json({ error: "Valid email required" }, { status: 400 });
  }
  if (!full_name || full_name.length < 2) {
    return Response.json({ error: "Full name required" }, { status: 400 });
  }
  if (!phone || phone.length < 7) {
    return Response.json({ error: "Phone number required (with country code)" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Duplicate check by email or phone
  const { data: existing } = await supabase
    .from("affiliates")
    .select("id, status")
    .or(`email.eq.${email},phone.eq.${phone}`)
    .maybeSingle();
  if (existing) {
    return Response.json(
      { error: "An application with this email or phone already exists" },
      { status: 409 },
    );
  }

  let referral_code: string;
  try {
    referral_code = await generateUniqueReferralCode();
  } catch (e) {
    console.error("affiliate code generation failed:", e);
    return Response.json({ error: "Internal error generating code" }, { status: 500 });
  }

  const initialStatus = AFFILIATE_CONFIG.AUTO_APPROVE ? "active" : "pending";
  const now = new Date().toISOString();

  const { data: affiliate, error } = await supabase
    .from("affiliates")
    .insert({
      email,
      full_name,
      phone,
      bio: bio || null,
      network_description: network_description || null,
      display_name,
      referral_code,
      status: initialStatus,
      approved_at: AFFILIATE_CONFIG.AUTO_APPROVE ? now : null,
      approved_by_admin: AFFILIATE_CONFIG.AUTO_APPROVE ? "auto" : null,
    })
    .select("*")
    .single();

  if (error || !affiliate) {
    console.error("affiliates insert failed:", error);
    return Response.json({ error: "Failed to create application" }, { status: 500 });
  }

  // Notifications (best-effort, do not block)
  if (AFFILIATE_CONFIG.AUTO_APPROVE) {
    await notifyApplicationApproved(affiliate);
  } else {
    await notifyAdminNewApplication(affiliate);
  }

  return Response.json({
    success: true,
    id: affiliate.id,
    status: affiliate.status,
    referral_code: AFFILIATE_CONFIG.AUTO_APPROVE ? affiliate.referral_code : undefined,
  });
}
