/**
 * POST /api/contact
 *
 * Receives the contact form submission, validates inputs, and sends an
 * email to contact@stroby.ai via Gmail SMTP using a Workspace App
 * Password (the same auth pattern Echo's notify.py uses on the leadgen
 * sidecar — minimal new infra).
 *
 * Required env vars in Vercel:
 *   GMAIL_SMTP_USER         — full Gmail/Workspace address (e.g. joaquim@stroby.ai)
 *   GMAIL_APP_PASSWORD      — 16-char Workspace App Password
 *
 * The destination address is hardcoded to contact@stroby.ai per the
 * product spec. The From header uses joaquim@stroby.ai (the
 * authenticated mailbox) so SPF/DKIM stay clean.
 */
import { NextRequest } from "next/server";
import nodemailer from "nodemailer";
import { checkRateLimit } from "@/lib/rate-limiter";

const TO_ADDRESS = "contact@stroby.ai";
const SMTP_HOST = "smtp.gmail.com";
const SMTP_PORT = 587;

interface ContactBody {
  name?: string;
  email?: string;
  subject?: string;
  message?: string;
  honeypot?: string; // hidden field for bot defense
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(request: NextRequest) {
  // Per-IP rate limit. Honeypot stops dumb bots; this caps determined ones.
  // 30/hour per IP — same default the WhatsApp webhook + widget use.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const rate = checkRateLimit(`contact:${ip}`);
  if (!rate.allowed) {
    // Pretend success so an attacker can't trivially detect the limit
    return Response.json({ success: true });
  }

  let body: ContactBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim();
  const subject = (body.subject ?? "").trim();
  const message = (body.message ?? "").trim();
  const honeypot = (body.honeypot ?? "").trim();

  // Honeypot — bots usually fill every field. Real users leave it empty.
  if (honeypot) {
    // Pretend success so the bot doesn't retry, but don't actually send.
    return Response.json({ success: true });
  }

  // Validation
  if (!name || name.length < 2) {
    return Response.json({ error: "Please enter your name." }, { status: 400 });
  }
  if (!email || !email.includes("@") || email.length < 5) {
    return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (!message || message.length < 10) {
    return Response.json({ error: "Please write a message (at least 10 characters)." }, { status: 400 });
  }
  if (message.length > 5000) {
    return Response.json({ error: "Message is too long (max 5000 characters)." }, { status: 400 });
  }

  const smtpUser = process.env.GMAIL_SMTP_USER;
  const smtpPass = process.env.GMAIL_APP_PASSWORD;
  if (!smtpUser || !smtpPass) {
    console.error("Contact form: GMAIL_SMTP_USER or GMAIL_APP_PASSWORD not set in env");
    return Response.json(
      { error: "Email service is not configured. Please try again later or use WhatsApp." },
      { status: 503 },
    );
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false, // STARTTLS on 587
    auth: { user: smtpUser, pass: smtpPass },
  });

  const cleanSubject = subject || `Contact form: ${name}`;
  const textBody = [
    `New contact form submission from stroby.ai`,
    ``,
    `Name:    ${name}`,
    `Email:   ${email}`,
    `Subject: ${cleanSubject}`,
    ``,
    `--- message ---`,
    message,
    `---`,
    ``,
    `Submitted: ${new Date().toISOString()}`,
  ].join("\n");

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width:600px; margin:auto;">
      <h2 style="color:#333;">New contact form submission</h2>
      <table style="border-collapse:collapse; width:100%;">
        <tr><td style="padding:8px; font-weight:bold; vertical-align:top;">Name:</td><td style="padding:8px;">${escapeHtml(name)}</td></tr>
        <tr><td style="padding:8px; font-weight:bold; vertical-align:top;">Email:</td><td style="padding:8px;"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
        <tr><td style="padding:8px; font-weight:bold; vertical-align:top;">Subject:</td><td style="padding:8px;">${escapeHtml(cleanSubject)}</td></tr>
      </table>
      <h3 style="color:#333; margin-top:24px;">Message</h3>
      <div style="padding:16px; background:#f5f5f5; border-radius:8px; white-space:pre-wrap;">${escapeHtml(message)}</div>
      <p style="color:#999; font-size:12px; margin-top:24px;">Submitted ${new Date().toISOString()}</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"Stroby Contact Form" <${smtpUser}>`,
      to: TO_ADDRESS,
      replyTo: `"${name}" <${email}>`, // hitting Reply in Gmail goes straight to the sender
      subject: cleanSubject,
      text: textBody,
      html: htmlBody,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Contact form SMTP send failed:", msg);
    return Response.json(
      { error: "Failed to send message. Please try WhatsApp or email contact@stroby.ai directly." },
      { status: 500 },
    );
  }

  return Response.json({ success: true });
}
