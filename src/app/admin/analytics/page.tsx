"use client";

import { useState } from "react";
import { Lock, BarChart3, Users, ArrowDown, ArrowRight } from "lucide-react";
import Image from "next/image";

interface FunnelData {
  funnel: Record<string, number>;
  step_completions: Record<string, number>;
}

export default function AnalyticsPage() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/analytics/onboarding?key=${encodeURIComponent(password)}`);
      if (!res.ok) { setError("Wrong password"); setLoading(false); return; }
      setData(await res.json());
      setAuthenticated(true);
    } catch { setError("Failed to connect"); }
    setLoading(false);
  }

  async function refresh() {
    const res = await fetch(`/api/analytics/onboarding?key=${encodeURIComponent(password)}`);
    if (res.ok) setData(await res.json());
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4">
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4">
          <div className="flex flex-col items-center gap-3">
            <Image src="/logo-emoji.png" alt="Stroby" width={48} height={48} />
            <h1 className="text-xl font-bold">Onboarding Analytics</h1>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Password" autoFocus
              className="w-full rounded-lg border bg-background py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          {error && <p className="text-center text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={loading || !password}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {loading ? "Loading..." : "Sign in"}
          </button>
        </form>
      </div>
    );
  }

  if (!data) return null;

  const funnel = data.funnel;
  const steps = data.step_completions;

  const started = funnel.started || 0;
  const roleSelected = funnel.role_selected || 0;
  const completed = funnel.completed || 0;

  const conversionRate = started > 0 ? Math.round((completed / started) * 100) : 0;
  const roleRate = started > 0 ? Math.round((roleSelected / started) * 100) : 0;

  // Sort steps by step number
  const sortedSteps = Object.entries(steps)
    .map(([key, count]) => {
      const parts = key.replace("step_", "").split("_");
      const num = parseInt(parts[0], 10);
      const field = parts.slice(1).join("_");
      return { num, field, count };
    })
    .sort((a, b) => a.num - b.num);

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/logo-emoji.png" alt="Stroby" width={32} height={32} />
            <h1 className="text-lg font-bold">Onboarding Analytics</h1>
          </div>
          <div className="flex gap-2">
            <a href="/admin" className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">Dashboard</a>
            <button onClick={refresh} className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">Refresh</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
        {/* Overview cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="size-4" />
              <span className="text-xs font-medium">Started</span>
            </div>
            <p className="mt-2 text-2xl font-bold">{started}</p>
            <p className="text-xs text-muted-foreground">unique sessions</p>
          </div>
          <div className="rounded-xl border p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <BarChart3 className="size-4" />
              <span className="text-xs font-medium">Completed</span>
            </div>
            <p className="mt-2 text-2xl font-bold">{completed}</p>
            <p className="text-xs text-muted-foreground">{conversionRate}% conversion</p>
          </div>
          <div className="rounded-xl border p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <ArrowDown className="size-4" />
              <span className="text-xs font-medium">Drop-off</span>
            </div>
            <p className="mt-2 text-2xl font-bold">{started - completed}</p>
            <p className="text-xs text-muted-foreground">{started > 0 ? 100 - conversionRate : 0}% abandoned</p>
          </div>
        </div>

        {/* Funnel visualization */}
        <div className="rounded-xl border p-4 sm:p-5">
          <h3 className="mb-4 text-sm font-semibold">Conversion Funnel</h3>
          <div className="space-y-3">
            <FunnelStep label="Onboarding Started" count={started} total={started} />
            <div className="flex justify-center"><ArrowDown className="size-4 text-muted-foreground" /></div>
            <FunnelStep label="Role Selected" count={roleSelected} total={started} />
            <div className="flex justify-center"><ArrowDown className="size-4 text-muted-foreground" /></div>
            <FunnelStep label="Completed" count={completed} total={started} />
          </div>
        </div>

        {/* Step-by-step breakdown */}
        {sortedSteps.length > 0 && (
          <div className="rounded-xl border p-4 sm:p-5">
            <h3 className="mb-4 text-sm font-semibold">Step Completion (per field)</h3>
            <div className="space-y-2">
              {sortedSteps.map((step) => (
                <div key={`${step.num}_${step.field}`} className="flex items-center gap-3">
                  <span className="w-6 text-right text-xs font-mono text-muted-foreground">{step.num}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{step.field.replace(/_/g, " ")}</span>
                      <span className="font-medium">{step.count}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${started > 0 ? Math.round((step.count / started) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Raw events */}
        <div className="rounded-xl border p-4 sm:p-5">
          <h3 className="mb-3 text-sm font-semibold">All Events</h3>
          <div className="flex flex-wrap gap-3">
            {Object.entries(funnel).map(([event, count]) => (
              <div key={event} className="rounded-lg border px-3 py-2">
                <span className="text-sm font-medium">{count}</span>
                <span className="ml-1.5 text-xs text-muted-foreground">{event.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function FunnelStep({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm">
          <strong>{count}</strong>
          <span className="ml-1 text-muted-foreground">({pct}%)</span>
        </span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
