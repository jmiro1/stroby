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
import nodemailer from "nodemailer";
import { createServiceClient } from "@/lib/supabase";
import { generateUniqueReferralCode } from "@/lib/affiliates/codes";
import { AFFILIATE_CONFIG } from "@/lib/affiliates/config";
import {
  notifyAdminNewApplication,
  notifyApplicationApproved,
} from "@/lib/affiliates/notify";

/**
 * Send a friendly confirmation email to the applicant. Best-effort: never
 * blocks the apply flow if SMTP fails. Uses the same Gmail SMTP credentials
 * as /api/contact (GMAIL_SMTP_USER + GMAIL_APP_PASSWORD).
 */
async function sendApplicationConfirmation(args: {
  to: string;
  name: string;
}): Promise<void> {
  const smtpUser = process.env.GMAIL_SMTP_USER;
  const smtpPass = process.env.GMAIL_APP_PASSWORD;
  if (!smtpUser || !smtpPass) {
    console.warn("Apply confirmation email skipped: GMAIL_SMTP_USER / GMAIL_APP_PASSWORD not set");
    return;
  }

  const firstName = args.name.split(/\s+/)[0] || args.name;
  const subject = "We've received your Stroby affiliate application";
  const text = [
    `Hey ${firstName},`,
    ``,
    `Thanks for applying to the Stroby affiliate program — we've got your application and a real human will hand-review it in the next 24 hours.`,
    ``,
    `WHAT HAPPENS NEXT`,
    `When your application is approved, we'll send you a WhatsApp message with your personal referral link and a sign-in link for your dashboard. You'll earn up to 50% of Stroby's platform fees on every deal (25% per side you referred, 50% if you brought both).* This is a launch campaign rate — locked for at least 12 months from your signup.`,
    ``,
    `IMPORTANT — DON'T LOSE THIS EMAIL`,
    `If you don't see further updates from us, check your spam and promotions folders. Marking this email as "Not spam" or moving it to your primary inbox makes sure future updates land where you can see them.`,
    ``,
    `In the meantime, you can also message Stroby directly on WhatsApp to get a head start: https://wa.me/message/2QFL7QR7EBZTD1`,
    ``,
    `Talk soon,`,
    `Stroby`,
  ].join("\n");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:auto;color:#333;">
      <p>Hey ${firstName},</p>
      <p>Thanks for applying to the Stroby affiliate program — we&rsquo;ve got your application and a real human will hand-review it in the next 24 hours.</p>

      <h3 style="margin-top:24px;">What happens next</h3>
      <p>When your application is approved, we&rsquo;ll send you a WhatsApp message with your personal referral link and a sign-in link for your dashboard. You&rsquo;ll earn up to 50% of Stroby&rsquo;s platform fees on every deal (25% per side you referred, 50% if you brought both).* This is a launch campaign rate &mdash; locked for at least 12 months from your signup.</p>

      <h3 style="margin-top:24px;">⚠️ Don&rsquo;t lose this email</h3>
      <p>If you don&rsquo;t see further updates from us, check your <strong>spam and promotions folders</strong>. Marking this email as &ldquo;Not spam&rdquo; or moving it to your primary inbox makes sure future updates land where you can see them.</p>

      <p style="margin-top:24px;">In the meantime, you can also message Stroby directly on WhatsApp to get a head start:</p>
      <p>
        <a href="https://wa.me/message/2QFL7QR7EBZTD1" style="display:inline-block;background:#25D366;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600;">
          Open WhatsApp →
        </a>
      </p>

      <p style="margin-top:32px;color:#666;">Talk soon,<br/>Stroby</p>
    </div>
  `;

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user: smtpUser, pass: smtpPass },
    });
    await transporter.sendMail({
      from: `"Stroby" <${smtpUser}>`,
      to: args.to,
      subject,
      text,
      html,
    });
  } catch (err) {
    console.error("Apply confirmation email send failed:", err);
    // Don't throw — confirmation email is best-effort
  }
}

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
  const phoneRaw = (body.phone ?? "").trim();
  const network_description = (body.network_description ?? "").trim();
  const bio = (body.bio ?? "").trim();
  const display_name = (body.display_name ?? "").trim() || null;

  // Validation. Email/phone are interpolated into a PostgREST .or() filter
  // below — strict format checks here also serve as injection prevention
  // (a comma in either value would let an attacker append OR clauses).
  if (!email || !/^[^\s,@]+@[^\s,@]+\.[^\s,@]+$/.test(email) || email.length > 320) {
    return Response.json({ error: "Valid email required" }, { status: 400 });
  }
  if (!full_name || full_name.length < 2 || full_name.length > 200) {
    return Response.json({ error: "Full name required" }, { status: 400 });
  }
  const phone = phoneRaw.replace(/\D/g, "");
  if (phone.length < 7 || phone.length > 15) {
    return Response.json({ error: "Phone number required (with country code)" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Duplicate check by email or phone. email/phone are validated above;
  // phone is digit-only and email contains no commas — both safe to
  // interpolate into the PostgREST filter. Match both '15551234567' and
  // '+15551234567' since the codebase stores phones in either format.
  const { data: existing } = await supabase
    .from("affiliates")
    .select("id, status")
    .or(`email.eq.${email},phone.eq.${phone},phone.eq.+${phone}`)
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
      phone: `+${phone}`,
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

  // Confirmation email to the applicant (best-effort)
  await sendApplicationConfirmation({
    to: affiliate.email,
    name: affiliate.full_name,
  });

  return Response.json({
    success: true,
    id: affiliate.id,
    status: affiliate.status,
    referral_code: AFFILIATE_CONFIG.AUTO_APPROVE ? affiliate.referral_code : undefined,
  });
}
