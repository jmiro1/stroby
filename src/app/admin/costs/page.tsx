"use client";

import { useState } from "react";
import { Lock, DollarSign, Zap, TrendingUp } from "lucide-react";
import Image from "next/image";

interface CostData {
  today: { cost: number; tokensIn: number; tokensOut: number };
  week: { cost: number };
  month: { cost: number };
  byProvider: Record<string, number>;
  byRoute: Record<string, number>;
  dailyTrend: Record<string, number>;
}

function formatCost(n: number): string {
  if (n < 0.01) return `$${(n * 100).toFixed(4)}¢`;
  return `$${n.toFixed(4)}`;
}

export default function CostsPage() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/costs?key=${encodeURIComponent(password)}`);
      if (!res.ok) { setError("Wrong password"); setLoading(false); return; }
      setData(await res.json());
      setAuthenticated(true);
    } catch { setError("Failed to connect"); }
    setLoading(false);
  }

  async function refresh() {
    const res = await fetch(`/api/admin/costs?key=${encodeURIComponent(password)}`);
    if (res.ok) setData(await res.json());
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4">
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4">
          <div className="flex flex-col items-center gap-3">
            <Image src="/logo-emoji.png" alt="Stroby" width={48} height={48} />
            <h1 className="text-xl font-bold">Costs</h1>
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

  const trendEntries = Object.entries(data.dailyTrend).sort((a, b) => a[0].localeCompare(b[0]));
  const maxTrend = Math.max(...trendEntries.map(([, v]) => v), 0.0001);

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/logo-emoji.png" alt="Stroby" width={32} height={32} />
            <h1 className="text-lg font-bold">API Costs</h1>
          </div>
          <div className="flex gap-2">
            <a href="/admin" className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">Dashboard</a>
            <button onClick={refresh} className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">Refresh</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <DollarSign className="size-4" />
              <span className="text-xs font-medium">Today</span>
            </div>
            <p className="mt-2 text-2xl font-bold">{formatCost(data.today.cost)}</p>
            <p className="text-xs text-muted-foreground">
              {data.today.tokensIn.toLocaleString()} in · {data.today.tokensOut.toLocaleString()} out
            </p>
          </div>
          <div className="rounded-xl border p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <TrendingUp className="size-4" />
              <span className="text-xs font-medium">Last 7 days</span>
            </div>
            <p className="mt-2 text-2xl font-bold">{formatCost(data.week.cost)}</p>
            <p className="text-xs text-muted-foreground">avg {formatCost(data.week.cost / 7)}/day</p>
          </div>
          <div className="rounded-xl border p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Zap className="size-4" />
              <span className="text-xs font-medium">This month</span>
            </div>
            <p className="mt-2 text-2xl font-bold">{formatCost(data.month.cost)}</p>
            <p className="text-xs text-muted-foreground">month-to-date</p>
          </div>
        </div>

        {Object.keys(data.byRoute).length > 0 && (
          <div className="rounded-xl border p-4 sm:p-5">
            <h3 className="mb-3 text-sm font-semibold">By Route (Today)</h3>
            <div className="space-y-2">
              {Object.entries(data.byRoute).sort((a, b) => b[1] - a[1]).map(([route, cost]) => (
                <div key={route} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{route}</span>
                  <span className="font-medium">{formatCost(cost)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {Object.keys(data.byProvider).length > 0 && (
          <div className="rounded-xl border p-4 sm:p-5">
            <h3 className="mb-3 text-sm font-semibold">By Provider (Today)</h3>
            <div className="space-y-2">
              {Object.entries(data.byProvider).map(([provider, cost]) => (
                <div key={provider} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground capitalize">{provider}</span>
                  <span className="font-medium">{formatCost(cost)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {trendEntries.length > 0 && (
          <div className="rounded-xl border p-4 sm:p-5">
            <h3 className="mb-3 text-sm font-semibold">Daily Trend (Last 30 Days)</h3>
            <div className="flex items-end gap-1 h-32">
              {trendEntries.map(([date, cost]) => (
                <div key={date} className="flex-1 flex flex-col justify-end" title={`${date}: ${formatCost(cost)}`}>
                  <div className="rounded-t bg-primary/70 hover:bg-primary transition-colors"
                    style={{ height: `${(cost / maxTrend) * 100}%` }} />
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground text-center">Peak: {formatCost(maxTrend)}</p>
          </div>
        )}
      </main>
    </div>
  );
}
