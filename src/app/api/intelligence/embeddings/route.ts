import { NextRequest } from "next/server";
import { embedAllProfiles } from "@/lib/intelligence/embeddings";

export async function POST(request: NextRequest) {
  const { verifyIntelligenceAuth } = await import("@/lib/intelligence/auth");
  if (!verifyIntelligenceAuth(request.headers.get("authorization"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await embedAllProfiles();
    return Response.json(result);
  } catch (e) {
    console.error("embeddings/refresh failed:", e);
    return Response.json({ error: "Embedding refresh failed" }, { status: 500 });
  }
}
