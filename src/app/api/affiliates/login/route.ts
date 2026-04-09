/**
 * POST /api/affiliates/login
 *
 * Request a magic-link sign-in via WhatsApp. Body: { phone: string }.
 *
 * Always returns success (does NOT leak whether the phone is registered).
 * If the phone matches an active affiliate, a magic-link WhatsApp is sent.
 */
import { NextRequest } from "next/server";
import { issueMagicLink } from "@/lib/affiliates/auth";

interface LoginBody {
  phone?: string;
}

export async function POST(request: NextRequest) {
  let body: LoginBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const phone = (body.phone ?? "").trim();
  if (!phone) {
    return Response.json({ error: "Phone required" }, { status: 400 });
  }

  const result = await issueMagicLink(phone);
  if (!result.ok) {
    // Only surface non-existential errors. We never tell the user "phone not found".
    return Response.json({ error: result.error ?? "Failed" }, { status: 500 });
  }

  return Response.json({
    success: true,
    message: "If your phone is registered as an affiliate, you'll receive a sign-in link via WhatsApp shortly.",
  });
}
