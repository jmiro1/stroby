import { NextRequest } from "next/server";
import { getMatchesForCreator } from "@/lib/intelligence/matching";

export async function GET(request: NextRequest) {
  const { verifyIntelligenceAuth } = await import("@/lib/intelligence/auth");
  if (!verifyIntelligenceAuth(request.headers.get("authorization"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const creatorId = url.searchParams.get("id");
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 1), 100);

  if (!creatorId || !/^[0-9a-f-]{36}$/.test(creatorId)) {
    return Response.json({ error: "Invalid creator id" }, { status: 400 });
  }

  try {
    const result = await getMatchesForCreator(creatorId, limit);
    if (result && typeof result === "object" && !Array.isArray(result) && (result as unknown as Record<string, unknown>).profile_incomplete) {
      return Response.json({ creator_id: creatorId, ...(result as unknown as Record<string, unknown>) }, { status: 200 });
    }
    const matches = result as unknown[];
    return Response.json({ creator_id: creatorId, matches, count: matches.length });
  } catch (e) {
    console.error("matches/creator failed:", e);
    return Response.json({ error: "Match query failed" }, { status: 500 });
  }
}
