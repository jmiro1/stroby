"use client";

import { useState } from "react";
import { Lock, Users, MessageSquare, AlertTriangle, TrendingUp, CheckCircle, Clock, MessagesSquare } from "lucide-react";
import Image from "next/image";

interface Stats {
  users: { newsletters: number; businesses: number; others: number; total: number };
  verification: Record<string, number>;
  introductions: Record<string, number>;
  messages_today: { inbound: number; outbound: number };
  flagged: { unreviewed: number; recent: { phone: string; content: string; flag_reason: string; created_at: string }[] };
  recent_signups: {
    newsletters: { newsletter_name: string; primary_niche: string; subscriber_count: number | null; created_at: string; verification_status: string }[];
    businesses: { company_name: string; primary_niche: string; budget_range: string; created_at: string }[];
  };
  niches: Record<string, number>;
  all_profiles?: {
    creators: { id: string; newsletter_name: string; owner_name: string; primary_niche: string; subscriber_count: number | null; audience_reach: number | null; platform: string | null; email: string; phone: string; onboarding_status: string; verification_status: string; created_at: string }[];
    brands: { id: string; company_name: string; contact_name: string; primary_niche: string; budget_range: string | null; email: string; phone: string; onboarding_status: string; created_at: string }[];
  };
  whatsapp_token?: { expiresAt: number | null; daysRemaining: number | null; error?: string };
  generated_at: string;
}

interface ConversationMessage {
  direction: string;
  content: string;
  created_at: string;
}

interface Conversation {
  userId: string;
  userType: string;
  name: string;
  phone: string;
  niche: string;
  messages: ConversationMessage[];
}

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [convLoading, setConvLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/stats?key=${encodeURIComponent(password)}`);
      if (!res.ok) {
        setError("Wrong password");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setStats(data);
      setAuthenticated(true);
    } catch {
      setError("Failed to connect");
    }
    setLoading(false);
  }

  async function refresh() {
    const res = await fetch(`/api/admin/stats?key=${encodeURIComponent(password)}`);
    if (res.ok) setStats(await res.json());
  }

  async function loadConversations() {
    setConvLoading(true);
    try {
      const res = await fetch(`/api/admin/stats?view=conversations&key=${encodeURIComponent(password)}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch {
      // silently fail
    }
    setConvLoading(false);
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4">
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4">
          <div className="flex flex-col items-center gap-3">
            <Image src="/logo-emoji.png" alt="Stroby" width={48} height={48} />
            <h1 className="text-xl font-bold">Stroby Admin</h1>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded-lg border bg-background py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />
          </div>
          {error && <p className="text-center text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {loading ? "Loading..." : "Sign in"}
          </button>
        </form>
      </div>
    );
  }

  if (!stats) return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <div className="flex items-center gap-2 text-muted-foreground">
        <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <span className="text-sm">Loading dashboard...</span>
      </div>
    </div>
  );

  const totalIntros = Object.values(stats.introductions).reduce((a, b) => a + b, 0);
  const acceptedIntros = (stats.introductions.introduced || 0) + (stats.introductions.newsletter_accepted || 0) + (stats.introductions.business_accepted || 0) + (stats.introductions.completed || 0);

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/logo-emoji.png" alt="Stroby" width={32} height={32} />
            <h1 className="text-lg font-bold">Stroby Admin</h1>
          </div>
          <div className="flex gap-2">
            <a href="/admin/matches" className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">Matches</a>
            <a href="/admin/growth" className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">Growth</a>
            <a href="/admin/analytics" className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">Analytics</a>
            <a href="/admin/costs" className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">Costs</a>
            <button onClick={refresh} className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">Refresh</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
        {/* Stat cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Users} label="Total Users" value={stats.users.total} sub={`${stats.users.newsletters} creators · ${stats.users.businesses} brands`} />
          <StatCard icon={TrendingUp} label="Introductions" value={totalIntros} sub={`${acceptedIntros} accepted`} />
          <StatCard icon={MessageSquare} label="Messages Today" value={stats.messages_today.inbound + stats.messages_today.outbound} sub={`${stats.messages_today.inbound} in · ${stats.messages_today.outbound} out`} />
          <StatCard icon={AlertTriangle} label="Flagged" value={stats.flagged.unreviewed} sub="unreviewed" color={stats.flagged.unreviewed > 0 ? "text-red-500" : undefined} />
        </div>

        {/* WhatsApp token status */}
        {stats.whatsapp_token && (
          <div className={`rounded-xl border p-4 ${
            stats.whatsapp_token.daysRemaining == null
              ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950"
              : stats.whatsapp_token.daysRemaining < 7
              ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950"
              : stats.whatsapp_token.daysRemaining < 14
              ? "border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950"
              : "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950"
          }`}>
            <p className="text-sm font-medium">
              WhatsApp token: {stats.whatsapp_token.daysRemaining == null
                ? "Permanent ✅"
                : stats.whatsapp_token.daysRemaining < 7
                ? `⚠️ EXPIRES IN ${stats.whatsapp_token.daysRemaining} DAYS — RENEW NOW`
                : stats.whatsapp_token.daysRemaining < 14
                ? `Expires in ${stats.whatsapp_token.daysRemaining} days — plan to renew`
                : `${stats.whatsapp_token.daysRemaining} days remaining ✅`}
            </p>
          </div>
        )}

        {/* Verification */}
        <Section title="Verification Status">
          <div className="flex flex-wrap gap-3">
            {Object.entries(stats.verification).map(([status, count]) => (
              <div key={status} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                {status === "api_verified" || status === "screenshot" ? (
                  <CheckCircle className="size-4 text-green-500" />
                ) : (
                  <Clock className="size-4 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">{count}</span>
                <span className="text-xs text-muted-foreground">{status.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Intro breakdown */}
        {totalIntros > 0 && (
          <Section title="Introduction Breakdown">
            <div className="flex flex-wrap gap-3">
              {Object.entries(stats.introductions).map(([status, count]) => (
                <div key={status} className="rounded-lg border px-3 py-2">
                  <span className="text-sm font-medium">{count}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">{status.replace(/_/g, " ")}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Niches */}
        {Object.keys(stats.niches).length > 0 && (
          <Section title="Business Niches">
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.niches).sort((a, b) => b[1] - a[1]).map(([niche, count]) => (
                <span key={niche} className="rounded-full border px-3 py-1 text-xs">
                  {niche} <strong>{count}</strong>
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Flagged messages */}
        {stats.flagged.recent.length > 0 && (
          <Section title="Flagged Messages">
            <div className="space-y-3">
              {stats.flagged.recent.map((msg, i) => (
                <div key={i} className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700 dark:bg-red-900 dark:text-red-300">
                      {msg.flag_reason.replace(/_/g, " ")}
                    </span>
                    <span>{msg.phone}</span>
                    <span>{new Date(msg.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="mt-1.5 text-sm">{msg.content.slice(0, 200)}{msg.content.length > 200 ? "..." : ""}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Recent signups */}
        <Section title="Recent Signups (7 days)">
          <div className="space-y-4">
            {stats.recent_signups.newsletters.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-medium uppercase text-muted-foreground">Creators</h4>
                <div className="space-y-2">
                  {stats.recent_signups.newsletters.map((nl, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">{nl.newsletter_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {nl.primary_niche} · {nl.subscriber_count ? `${nl.subscriber_count.toLocaleString()} subs` : "no subs reported"}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${
                          nl.verification_status !== "unverified"
                            ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                            : "bg-muted text-muted-foreground"
                        }`}>
                          {nl.verification_status === "unverified" ? "unverified" : "verified"}
                        </span>
                        <p className="mt-1 text-xs text-muted-foreground">{new Date(nl.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {stats.recent_signups.businesses.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-medium uppercase text-muted-foreground">Brands</h4>
                <div className="space-y-2">
                  {stats.recent_signups.businesses.map((biz, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">{biz.company_name}</p>
                        <p className="text-xs text-muted-foreground">{biz.primary_niche} · {biz.budget_range || "no budget"}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">{new Date(biz.created_at).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>

        {/* All Profiles */}
        {stats.all_profiles && (
          <Section title="All Profiles">
            <div className="space-y-4">
              {stats.all_profiles.creators.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                    Creators ({stats.all_profiles.creators.length})
                  </h4>
                  <div className="space-y-2">
                    {stats.all_profiles.creators.map((c) => (
                      <div key={c.id} className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <p className="text-sm font-medium">{c.newsletter_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.owner_name !== "Creator" ? `${c.owner_name} · ` : ""}{c.primary_niche}
                            {c.platform && c.platform !== "other" ? ` · ${c.platform}` : ""}
                            {c.audience_reach ? ` · ${c.audience_reach.toLocaleString()}` : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className={`rounded-full px-2 py-0.5 text-xs ${
                            c.onboarding_status === "whatsapp_active"
                              ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                              : "bg-muted text-muted-foreground"
                          }`}>
                            {c.onboarding_status}
                          </span>
                          <p className="mt-1 text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {stats.all_profiles.brands.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                    Brands ({stats.all_profiles.brands.length})
                  </h4>
                  <div className="space-y-2">
                    {stats.all_profiles.brands.map((b) => (
                      <div key={b.id} className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <p className="text-sm font-medium">{b.company_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {b.contact_name} · {b.primary_niche}
                            {b.budget_range ? ` · ${b.budget_range}` : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className={`rounded-full px-2 py-0.5 text-xs ${
                            b.onboarding_status === "whatsapp_active"
                              ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                              : "bg-muted text-muted-foreground"
                          }`}>
                            {b.onboarding_status}
                          </span>
                          <p className="mt-1 text-xs text-muted-foreground">{new Date(b.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Conversations */}
        <Section title="Conversations">
          {conversations.length === 0 ? (
            <button
              onClick={loadConversations}
              disabled={convLoading}
              className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              <MessagesSquare className="size-4" />
              {convLoading ? "Loading..." : "Load Conversations"}
            </button>
          ) : (
            <div className="space-y-4">
              <button
                onClick={loadConversations}
                disabled={convLoading}
                className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                {convLoading ? "Refreshing..." : "Refresh"}
              </button>
              {conversations.map((conv) => (
                <div key={conv.userId} className="rounded-xl border p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <p className="text-sm font-semibold">{conv.name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      conv.userType === "newsletter"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                        : "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300"
                    }`}>
                      {conv.userType}
                    </span>
                    {conv.niche && (
                      <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                        {conv.niche}
                      </span>
                    )}
                    {conv.phone && (
                      <span className="ml-auto text-xs text-muted-foreground">{conv.phone}</span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {conv.messages.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                            msg.direction === "outbound"
                              ? "bg-blue-500 text-white"
                              : "bg-muted"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                          <p className={`mt-1 text-[10px] ${
                            msg.direction === "outbound" ? "text-blue-100" : "text-muted-foreground"
                          }`}>
                            {new Date(msg.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <p className="text-center text-xs text-muted-foreground">
          Generated {new Date(stats.generated_at).toLocaleString()}
        </p>
      </main>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: number; sub: string; color?: string;
}) {
  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className={`mt-2 text-2xl font-bold ${color || ""}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-4 sm:p-5">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}
