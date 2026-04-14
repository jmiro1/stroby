import { NextRequest } from "next/server";
import { processBrand } from "@/lib/intelligence/brand";

export async function POST(request: NextRequest) {
  const secret = process.env.INTELLIGENCE_API_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { brand_id, website_url, brand_name } = body;

  if (!brand_id || !/^[0-9a-f-]{36}$/.test(brand_id)) {
    return Response.json({ error: "Invalid brand_id" }, { status: 400 });
  }

  try {
    const result = await processBrand(brand_id, website_url || "", brand_name || "");
    if (!result) return Response.json({ analyzed: false, reason: "no website content or brand not found" });
    return Response.json({
      analyzed: true,
      analyses_count: result.analyses_count,
      ideal_audience: (result.synthesized as Record<string, unknown>)?.ideal_audience || "",
    });
  } catch (e) {
    console.error("analyze-brand failed:", e);
    return Response.json({ error: "Analysis failed" }, { status: 500 });
  }
}
