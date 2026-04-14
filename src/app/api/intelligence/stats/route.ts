import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const { verifyIntelligenceAuth } = await import("@/lib/intelligence/auth");
  const authResult = verifyIntelligenceAuth(request.headers.get("authorization"));
  if (!authResult) {
    // Debug: check if secret is set (don't leak value)
    const hasSecret = !!process.env.INTELLIGENCE_API_SECRET;
    const secretLen = (process.env.INTELLIGENCE_API_SECRET || "").length;
    const authHeader = request.headers.get("authorization") || "";
    const tokenLen = authHeader.startsWith("Bearer ") ? authHeader.length - 7 : 0;
    console.error(`Auth failed: hasSecret=${hasSecret}, secretLen=${secretLen}, tokenLen=${tokenLen}`);
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  try {
    const [
      { data: creatorsWithIntel },
      { data: brandsWithIntel },
    ] = await Promise.all([
      supabase.from("newsletter_profiles").select("id, content_intelligence")
        .eq("is_active", true).not("content_intelligence", "is", null),
      supabase.from("business_profiles").select("id, brand_intelligence")
        .eq("is_active", true).not("brand_intelligence", "is", null),
    ]);

    const totalIssues = (creatorsWithIntel || []).reduce((sum, p) => {
      const intel = typeof p.content_intelligence === "string"
        ? JSON.parse(p.content_intelligence) : p.content_intelligence;
      return sum + ((intel as Record<string, unknown>)?.issues_analyzed as number || 0);
    }, 0);

    return Response.json({
      creators_with_intelligence: creatorsWithIntel?.length || 0,
      brands_with_intelligence: brandsWithIntel?.length || 0,
      total_issues_analyzed: totalIssues,
    });
  } catch (e) {
    console.error("intelligence/stats failed:", e);
    return Response.json({ error: "Query failed" }, { status: 500 });
  }
}
