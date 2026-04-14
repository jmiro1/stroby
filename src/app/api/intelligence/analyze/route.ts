import { NextRequest } from "next/server";
import { processIncomingIssue } from "@/lib/intelligence/content";

/**
 * Analyze a newsletter issue for a signed-up creator.
 * Called when a newsletter issue arrives (via email forwarding webhook, manual trigger, etc.)
 */
export async function POST(request: NextRequest) {
  const { verifyIntelligenceAuth } = await import("@/lib/intelligence/auth");
  if (!verifyIntelligenceAuth(request.headers.get("authorization"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { sender_email, issue_text, publication_url } = body;

  if (!sender_email && !issue_text) {
    return Response.json({ error: "sender_email and issue_text required" }, { status: 400 });
  }

  try {
    const result = await processIncomingIssue(
      (sender_email || "").slice(0, 500),
      (issue_text || "").slice(0, 50000),
      (publication_url || "").slice(0, 2000)
    );

    if (!result) {
      return Response.json({ analyzed: false, reason: "not a signed-up creator or extraction failed" });
    }

    return Response.json({
      analyzed: true,
      issues_total: result.issues_analyzed || 0,
    });
  } catch (e) {
    console.error("intelligence/analyze failed:", e);
    return Response.json({ error: "Analysis failed" }, { status: 500 });
  }
}
