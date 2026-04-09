/**
 * POST /api/admin/affiliates/[id]/approve?key=...
 *
 * Approve a pending affiliate application. Sets status to `active`,
 * captures `approved_at` and `approved_by_admin`, sends a welcome
 * WhatsApp with the referral link.
 */
import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { notifyApplicationApproved } from "@/lib/affiliates/notify";
import type { Affiliate } from "@/lib/affiliates/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface ApproveBody {
  admin_name?: string;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!process.env.ADMIN_PASSWORD || key !== process.env.ADMIN_PASSWORD) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  let body: ApproveBody = {};
  try {
    body = await request.json();
  } catch {
    // body is optional
  }

  const supabase = createServiceClient();

  const { data: existing, error: lookupErr } = await supabase
    .from("affiliates")
    .select("*")
    .eq("id", id)
    .single();
  if (lookupErr || !existing) {
    return Response.json({ error: "Affiliate not found" }, { status: 404 });
  }
  if (existing.status === "active") {
    return Response.json({ error: "Already active" }, { status: 409 });
  }
  if (existing.status === "banned") {
    return Response.json({ error: "Cannot approve a banned affiliate" }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await supabase
    .from("affiliates")
    .update({
      status: "active",
      approved_at: now,
      approved_by_admin: body.admin_name ?? "admin",
    })
    .eq("id", id)
    .select("*")
    .single();

  if (updErr || !updated) {
    return Response.json({ error: "Failed to approve" }, { status: 500 });
  }

  await notifyApplicationApproved(updated as Affiliate);
  return Response.json({ success: true, affiliate: updated });
}
