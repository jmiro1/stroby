import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";

// Track onboarding funnel events
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, event, userType, stepNumber, stepField, source } = body;

    if (!sessionId || !event) {
      return Response.json({ error: "Missing sessionId or event" }, { status: 400 });
    }

    const supabase = createServiceClient();
    await supabase.from("onboarding_events").insert({
      session_id: sessionId,
      event,
      user_type: userType || null,
      step_number: stepNumber || null,
      step_field: stepField || null,
      source: source || "website",
    });

    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: true }); // Don't fail silently — analytics shouldn't break UX
  }
}

// Get funnel stats for admin
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || key !== adminPassword) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Get funnel counts
  const { data: events } = await supabase
    .from("onboarding_events")
    .select("event, user_type, step_number, step_field, session_id")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (!events) return Response.json({ funnel: {} });

  // Count unique sessions per event
  const funnel: Record<string, Set<string>> = {};
  const dropoffs: Record<string, number> = {};

  for (const e of events) {
    const key = e.event as string;
    if (!funnel[key]) funnel[key] = new Set();
    funnel[key].add(e.session_id as string);

    // Track step-level dropoff
    if (e.event === "step_completed" && e.step_field) {
      const stepKey = `step_${e.step_number}_${e.step_field}`;
      dropoffs[stepKey] = (dropoffs[stepKey] || 0) + 1;
    }
  }

  const funnelCounts: Record<string, number> = {};
  for (const [key, sessions] of Object.entries(funnel)) {
    funnelCounts[key] = sessions.size;
  }

  return Response.json({ funnel: funnelCounts, step_completions: dropoffs });
}
