/**
 * /api/affiliates/me/intros
 *
 *   POST → create a manual intro (pending referral row)
 *   GET  → list this affiliate's referrals
 */
import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getAffiliateFromSessionToken } from "@/lib/affiliates/auth";
import { AFFILIATE_CONFIG } from "@/lib/affiliates/config";
import { listReferralsByAffiliate } from "@/lib/affiliates/queries";
import type { ReferralRole } from "@/lib/affiliates/types";

interface IntroBody {
  email?: string;
  name?: string;
  role?: ReferralRole;
  intro_note?: string;
}

async function requireAffiliate(request: NextRequest) {
  const sessionToken = request.cookies.get(AFFILIATE_CONFIG.SESSION_COOKIE_NAME)?.value;
  return await getAffiliateFromSessionToken(sessionToken);
}

export async function POST(request: NextRequest) {
  const affiliate = await requireAffiliate(request);
  if (!affiliate) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: IntroBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const name = (body.name ?? "").trim();
  const role = body.role;
  const note = (body.intro_note ?? "").trim() || null;

  if (!email || !email.includes("@")) {
    return Response.json({ error: "Valid email required" }, { status: 400 });
  }
  if (!name || name.length < 2) {
    return Response.json({ error: "Name required" }, { status: 400 });
  }
  if (!role || !["newsletter", "business", "other"].includes(role)) {
    return Response.json({ error: "Role must be newsletter, business, or other" }, { status: 400 });
  }

  // Self-referral check by email
  if (email === affiliate.email.toLowerCase()) {
    return Response.json({ error: "You cannot refer yourself" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Check if there's already a pending intro for this email from this affiliate
  const { data: dup } = await supabase
    .from("affiliate_referrals")
    .select("id, status")
    .eq("affiliate_id", affiliate.id)
    .ilike("pending_email", email)
    .eq("status", "pending")
    .maybeSingle();
  if (dup) {
    return Response.json(
      { error: "You already have a pending intro for this email" },
      { status: 409 },
    );
  }

  const expiresAt = new Date(
    Date.now() + AFFILIATE_CONFIG.PENDING_INTRO_DAYS * 86400 * 1000,
  ).toISOString();

  const { data, error } = await supabase
    .from("affiliate_referrals")
    .insert({
      affiliate_id: affiliate.id,
      pending_email: email,
      pending_name: name,
      pending_role: role,
      pending_intro_note: note,
      attribution_method: "manual_intro",
      attribution_metadata: { source: "affiliate_dashboard" },
      status: "pending",
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("manual intro insert failed:", error);
    return Response.json({ error: "Failed to create intro" }, { status: 500 });
  }

  return Response.json({
    success: true,
    referral_id: data.id,
    expires_at: expiresAt,
    note: "When this person signs up using the email you provided, you'll automatically be credited as their introducer.",
  });
}

export async function GET(request: NextRequest) {
  const affiliate = await requireAffiliate(request);
  if (!affiliate) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const limit = parseInt(url.searchParams.get("limit") || "100", 10);

  const referrals = await listReferralsByAffiliate(affiliate.id, { status, limit });
  return Response.json({ referrals });
}
