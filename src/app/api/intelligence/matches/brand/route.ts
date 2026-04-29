import { NextRequest } from "next/server";
import { getMatchesForBrand } from "@/lib/intelligence/matching";

export async function GET(request: NextRequest) {
  const { verifyIntelligenceAuth } = await import("@/lib/intelligence/auth");
  if (!verifyIntelligenceAuth(request.headers.get("authorization"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const brandId = url.searchParams.get("id");
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 1), 100);
  const numericOnly = url.searchParams.get("numeric_only") === "1";
  const explain = url.searchParams.get("explain") === "full";

  if (!brandId || !/^[0-9a-f-]{36}$/.test(brandId)) {
    return Response.json({ error: "Invalid brand id" }, { status: 400 });
  }

  try {
    const result = await getMatchesForBrand(brandId, limit, { numericOnly, explain });
    // Profile-incomplete branch: structured nudge response, no matches array
    if (result && typeof result === "object" && !Array.isArray(result) && (result as unknown as Record<string, unknown>).profile_incomplete) {
      return Response.json({ brand_id: brandId, ...(result as unknown as Record<string, unknown>) }, { status: 200 });
    }
    const matches = result as unknown[];
    const diag = (matches as unknown as { _diag?: unknown })._diag;
    return Response.json({
      brand_id: brandId,
      matches: Array.from(matches),
      count: matches.length,
      reranked: !numericOnly,
      ...(explain && diag ? { _diag: diag } : {}),
    });
  } catch (e) {
    console.error("matches/brand failed:", e);
    return Response.json({ error: "Match query failed" }, { status: 500 });
  }
}
