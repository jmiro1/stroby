import { NextRequest } from "next/server";
import { getCostSummary } from "@/lib/api-usage";
import { isAdminAuthed } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  if (!isAdminAuthed(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await getCostSummary();
  return Response.json(summary);
}
