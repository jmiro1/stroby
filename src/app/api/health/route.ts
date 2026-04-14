import { createServiceClient } from "@/lib/supabase";

export async function GET() {
  const start = performance.now();
  const checks: Record<string, "ok" | "error"> = {};

  // Supabase connectivity
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from("newsletter_profiles").select("id", { count: "exact", head: true });
    checks.supabase = error ? "error" : "ok";
  } catch {
    checks.supabase = "error";
  }

  const healthy = Object.values(checks).every((v) => v === "ok");
  const duration = Math.round(performance.now() - start);

  return Response.json(
    { status: healthy ? "healthy" : "degraded", checks, duration_ms: duration, ts: Date.now() },
    { status: healthy ? 200 : 503 }
  );
}
