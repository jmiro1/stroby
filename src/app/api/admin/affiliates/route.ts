/**
 * GET /api/admin/affiliates?key=...&status=pending
 *
 * Admin endpoint listing affiliates by status. Auth via the existing
 * Stroby admin pattern (?key=ADMIN_PASSWORD query param).
 */
import { NextRequest } from "next/server";
import { listAffiliatesByStatus } from "@/lib/affiliates/queries";

function isAdminAuthed(url: URL): boolean {
  const key = url.searchParams.get("key");
  const adminPassword = process.env.ADMIN_PASSWORD;
  return !!adminPassword && key === adminPassword;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  if (!isAdminAuthed(url)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = (url.searchParams.get("status") ?? "pending") as
    | "pending"
    | "active"
    | "suspended"
    | "banned";
  if (!["pending", "active", "suspended", "banned"].includes(status)) {
    return Response.json({ error: "Invalid status" }, { status: 400 });
  }

  const affiliates = await listAffiliatesByStatus(status);
  return Response.json({ affiliates });
}
