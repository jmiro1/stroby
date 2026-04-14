import { NextRequest } from "next/server";
import { getMatchesForBrand } from "@/lib/intelligence/matching";

export async function GET(request: NextRequest) {
  const secret = process.env.INTELLIGENCE_API_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const brandId = url.searchParams.get("id");
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 1), 100);

  if (!brandId || !/^[0-9a-f-]{36}$/.test(brandId)) {
    return Response.json({ error: "Invalid brand id" }, { status: 400 });
  }

  try {
    const matches = await getMatchesForBrand(brandId, limit);
    return Response.json({ brand_id: brandId, matches, count: matches.length });
  } catch (e) {
    console.error("matches/brand failed:", e);
    return Response.json({ error: "Match query failed" }, { status: 500 });
  }
}
