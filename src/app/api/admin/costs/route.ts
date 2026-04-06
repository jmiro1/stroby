import { NextRequest } from "next/server";
import { getCostSummary } from "@/lib/api-usage";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword || key !== adminPassword) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await getCostSummary();
  return Response.json(summary);
}
