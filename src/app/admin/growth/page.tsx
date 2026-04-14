"use client";

import { useState } from "react";
import { Lock, TrendingUp, Users, BarChart3, Repeat, Zap } from "lucide-react";
import Image from "next/image";

interface WeeklyData {
  week: string;
  label: string;
  new_creators: number;
  new_brands: number;
  total_creators: number;
  total_brands: number;
}

interface DAUData {
  date: string;
  label: string;
  creators: number;
  brands: number;
}

interface GrowthData {
  weekly_growth: WeeklyData[];
  stickiness: { one_time: number; returning: number; engaged: number; power_user: number };
  stickiness_top_users: { user_id: string; user_type: string; active_days: number; last_active: string }[];
  daily_active_users: DAUData[];
  total_active_users_30d: number;
  generated_at: string;
}

export default function GrowthPage() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [data, setData] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/growth?key=${encodeURIComponent(password)}`);
      if (!res.ok) { setError("Wrong password"); setLoading(false); return; }
      setData(await res.json());
      setAuthenticated(true);
    } catch { setError("Failed to connect"); }
    setLoading(false);
  }

  async function refresh() {
    const res = await fetch(`/api/admin/growth?key=${encodeURIComponent(password)}`);
    if (res.ok) setData(await res.json());
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4">
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4">
          <div className="flex flex-col items-center gap-3">
            <Image src="/logo-emoji.png" alt="Stroby" width={48} height={48} />
            <h1 className="text-xl font-bold">Growth & Stickiness</h1>
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

  const weekly = data.weekly_growth;
  const latestWeek = weekly[weekly.length - 1];
  const prevWeek = weekly.length > 1 ? weekly[weekly.length - 2] : null;
  const creatorsGrowth = prevWeek ? latestWeek.new_creators - prevWeek.new_creators : 0;
  const brandsGrowth = prevWeek ? latestWeek.new_brands - prevWeek.new_brands : 0;

  const totalSticky = data.stickiness.one_time + data.stickiness.returning + data.stickiness.engaged + data.stickiness.power_user;

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/logo-emoji.png" alt="Stroby" width={32} height={32} />
            <h1 className="text-lg font-bold">Growth & Stickiness</h1>
          </div>
          <div className="flex gap-2">
            <a href="/admin" className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">Dashboard</a>
            <a href="/admin/analytics" className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">Analytics</a>
            <a href="/admin/costs" className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">Costs</a>
            <button onClick={refresh} className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">Refresh</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
        {/* Overview cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Users} label="Total Creators" value={latestWeek?.total_creators || 0}
            sub={`+${latestWeek?.new_creators || 0} this week`}
            trend={creatorsGrowth > 0 ? "up" : creatorsGrowth < 0 ? "down" : "flat"} />
          <StatCard icon={BarChart3} label="Total Brands" value={latestWeek?.total_brands || 0}
            sub={`+${latestWeek?.new_brands || 0} this week`}
            trend={brandsGrowth > 0 ? "up" : brandsGrowth < 0 ? "down" : "flat"} />
          <StatCard icon={Repeat} label="Active Users (30d)" value={data.total_active_users_30d}
            sub={`${data.stickiness.engaged + data.stickiness.power_user} engaged`} />
          <StatCard icon={Zap} label="Power Users" value={data.stickiness.power_user}
            sub="8+ active days in 30d" />
        </div>

        {/* Weekly new signups chart */}
        <Section title="Weekly New Signups (12 weeks)">
          <BarChart data={weekly.map((w) => ({
            label: w.label,
            values: [
              { value: w.new_creators, color: "#3b82f6", name: "Creators" },
              { value: w.new_brands, color: "#8b5cf6", name: "Brands" },
            ],
          }))} />
          <div className="mt-3 flex gap-4">
            <Legend color="#3b82f6" label="Creators" />
            <Legend color="#8b5cf6" label="Brands" />
          </div>
        </Section>

        {/* Cumulative growth chart */}
        <Section title="Cumulative Growth">
          <LineChart
            data={weekly}
            lines={[
              { key: "total_creators", color: "#3b82f6", label: "Creators" },
              { key: "total_brands", color: "#8b5cf6", label: "Brands" },
            ]}
          />
          <div className="mt-3 flex gap-4">
            <Legend color="#3b82f6" label="Creators" />
            <Legend color="#8b5cf6" label="Brands" />
          </div>
        </Section>

        {/* DAU chart */}
        <Section title="Daily Active Users (30 days)">
          <LineChart
            data={data.daily_active_users}
            lines={[
              { key: "creators", color: "#3b82f6", label: "Creators" },
              { key: "brands", color: "#8b5cf6", label: "Brands" },
            ]}
          />
          <div className="mt-3 flex gap-4">
            <Legend color="#3b82f6" label="Creators" />
            <Legend color="#8b5cf6" label="Brands" />
          </div>
        </Section>

        {/* Stickiness breakdown */}
        <Section title="Stickiness (30-day window)">
          <div className="grid gap-4 sm:grid-cols-4">
            <StickyBucket label="One-time" count={data.stickiness.one_time} total={totalSticky}
              desc="1 day" color="bg-red-500" />
            <StickyBucket label="Returning" count={data.stickiness.returning} total={totalSticky}
              desc="2-3 days" color="bg-yellow-500" />
            <StickyBucket label="Engaged" count={data.stickiness.engaged} total={totalSticky}
              desc="4-7 days" color="bg-blue-500" />
            <StickyBucket label="Power User" count={data.stickiness.power_user} total={totalSticky}
              desc="8+ days" color="bg-green-500" />
          </div>
        </Section>

        {/* Top engaged users */}
        {data.stickiness_top_users.length > 0 && (
          <Section title="Most Engaged Users (30d)">
            <div className="space-y-2">
              {data.stickiness_top_users.slice(0, 10).map((u) => (
                <div key={u.user_id} className="flex items-center gap-3 rounded-lg border p-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    u.user_type === "newsletter"
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                      : "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300"
                  }`}>
                    {u.user_type === "newsletter" ? "creator" : "brand"}
                  </span>
                  <span className="flex-1 font-mono text-xs text-muted-foreground">{u.user_id.slice(0, 8)}...</span>
                  <div className="text-right">
                    <span className="text-sm font-bold">{u.active_days} days</span>
                    <p className="text-xs text-muted-foreground">last: {u.last_active}</p>
                  </div>
                  <div className="w-24">
                    <div className="h-2 rounded-full bg-muted">
                      <div className="h-full rounded-full bg-green-500"
                        style={{ width: `${Math.min((u.active_days / 30) * 100, 100)}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Generated {new Date(data.generated_at).toLocaleString()}
        </p>
      </main>
    </div>
  );
}

// ── Chart components ──

function BarChart({ data }: {
  data: { label: string; values: { value: number; color: string; name: string }[] }[];
}) {
  const maxVal = Math.max(...data.flatMap((d) => d.values.map((v) => v.value)), 1);
  const barWidth = 100 / data.length;

  return (
    <div className="relative h-48 w-full">
      {/* Y-axis labels */}
      <div className="absolute left-0 top-0 flex h-full w-8 flex-col justify-between text-right">
        <span className="text-[10px] text-muted-foreground">{maxVal}</span>
        <span className="text-[10px] text-muted-foreground">{Math.round(maxVal / 2)}</span>
        <span className="text-[10px] text-muted-foreground">0</span>
      </div>
      {/* Chart area */}
      <div className="ml-10 flex h-full items-end gap-1">
        {data.map((d, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-0.5" style={{ width: `${barWidth}%` }}>
            <div className="flex w-full items-end justify-center gap-0.5" style={{ height: "calc(100% - 20px)" }}>
              {d.values.map((v, j) => (
                <div key={j} className="relative w-3 min-w-[6px] max-w-[16px] rounded-t-sm transition-all"
                  style={{
                    height: `${maxVal > 0 ? (v.value / maxVal) * 100 : 0}%`,
                    backgroundColor: v.color,
                    minHeight: v.value > 0 ? "4px" : "0",
                  }}
                  title={`${v.name}: ${v.value}`}
                />
              ))}
            </div>
            <span className="text-[9px] text-muted-foreground">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function LineChart({ data, lines }: {
  data: any[];
  lines: { key: string; color: string; label: string }[];
}) {
  if (data.length === 0) return <p className="text-sm text-muted-foreground">No data</p>;

  const allVals = lines.flatMap((l) => data.map((d) => (d[l.key] as number) || 0));
  const maxVal = Math.max(...allVals, 1);
  const minVal = Math.min(...allVals, 0);
  const range = maxVal - minVal || 1;

  const w = 600;
  const h = 180;
  const pad = { top: 10, right: 10, bottom: 30, left: 40 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  function x(i: number) { return pad.left + (i / (data.length - 1 || 1)) * chartW; }
  function y(val: number) { return pad.top + chartH - ((val - minVal) / range) * chartH; }

  // Show every Nth label to avoid overlap
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
        const yPos = pad.top + chartH * (1 - pct);
        const val = Math.round(minVal + range * pct);
        return (
          <g key={pct}>
            <line x1={pad.left} y1={yPos} x2={w - pad.right} y2={yPos}
              stroke="currentColor" strokeOpacity={0.1} strokeWidth={0.5} />
            <text x={pad.left - 5} y={yPos + 3} textAnchor="end"
              className="fill-muted-foreground" fontSize={8}>{val}</text>
          </g>
        );
      })}

      {/* X-axis labels */}
      {data.map((d, i) => i % labelEvery === 0 ? (
        <text key={i} x={x(i)} y={h - 5} textAnchor="middle"
          className="fill-muted-foreground" fontSize={8}>{d.label as string}</text>
      ) : null)}

      {/* Lines */}
      {lines.map((line) => {
        const points = data.map((d, i) => `${x(i)},${y((d[line.key] as number) || 0)}`);
        return (
          <g key={line.key}>
            <polyline points={points.join(" ")} fill="none" stroke={line.color}
              strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            {/* Dots */}
            {data.map((d, i) => (
              <circle key={i} cx={x(i)} cy={y((d[line.key] as number) || 0)}
                r={2.5} fill={line.color} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

// ── UI components ──

function StatCard({ icon: Icon, label, value, sub, trend }: {
  icon: React.ElementType; label: string; value: number; sub: string; trend?: "up" | "down" | "flat";
}) {
  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      <p className={`text-xs ${trend === "up" ? "text-green-600" : trend === "down" ? "text-red-500" : "text-muted-foreground"}`}>
        {trend === "up" && "↑ "}{trend === "down" && "↓ "}{sub}
      </p>
    </div>
  );
}

function StickyBucket({ label, count, total, desc, color }: {
  label: string; count: number; total: number; desc: string; color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="rounded-xl border p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold">{count}</p>
      <p className="text-xs text-muted-foreground">{desc} · {pct}%</p>
      <div className="mt-2 h-2 rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-4 sm:p-5">
      <h3 className="mb-4 text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}
