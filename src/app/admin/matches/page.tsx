"use client";

import { useState, useEffect } from "react";
import { Lock, Zap, Users, CheckCircle, AlertCircle } from "lucide-react";
import Image from "next/image";

interface Business {
  id: string;
  company_name: string;
  primary_niche: string;
  contact_name: string;
  partner_preference: string;
}

interface MatchResult {
  matchesFound: number;
  details: {
    creatorName: string;
    creatorType: string;
    score: number;
    introductionId: string | null;
    messageSent: boolean;
  }[];
}

export default function MatchesPage() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);
  const [triggerLoading, setTriggerLoading] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, MatchResult>>({});
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      // Use the stats endpoint to verify password and get business list
      const res = await fetch(`/api/admin/stats?key=${encodeURIComponent(password)}`);
      if (!res.ok) { setError("Wrong password"); setLoading(false); return; }

      // Fetch businesses
      const bizRes = await fetch(`/api/admin/businesses?key=${encodeURIComponent(password)}`);
      if (bizRes.ok) {
        const data = await bizRes.json();
        setBusinesses(data.businesses || []);
      }
      setAuthenticated(true);
    } catch { setError("Failed to connect"); }
    setLoading(false);
  }

  async function triggerMatch(bizId: string) {
    setTriggerLoading(bizId);
    try {
      const res = await fetch("/api/admin/trigger-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: password, userId: bizId, userType: "business" }),
      });
      const data = await res.json();
      setResults((prev) => ({ ...prev, [bizId]: data }));
    } catch {
      setResults((prev) => ({ ...prev, [bizId]: { matchesFound: -1, details: [] } }));
    }
    setTriggerLoading(null);
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4">
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4">
          <div className="flex flex-col items-center gap-3">
            <Image src="/logo-emoji.png" alt="Stroby" width={48} height={48} />
            <h1 className="text-xl font-bold">Manual Matching</h1>
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

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/logo-emoji.png" alt="Stroby" width={32} height={32} />
            <h1 className="text-lg font-bold">Manual Matching</h1>
          </div>
          <div className="flex gap-2">
            <a href="/admin" className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">Dashboard</a>
            <a href="/admin/analytics" className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">Analytics</a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-4 py-6 sm:px-6">
        <p className="text-sm text-muted-foreground">
          Select a business to run the matching engine immediately. Matches will be sent via WhatsApp.
        </p>

        {businesses.length === 0 && (
          <div className="rounded-xl border p-8 text-center">
            <Users className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">No businesses onboarded yet.</p>
          </div>
        )}

        {businesses.map((biz) => {
          const result = results[biz.id];
          const isLoading = triggerLoading === biz.id;

          return (
            <div key={biz.id} className="rounded-xl border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{biz.company_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {biz.primary_niche} · {biz.contact_name} · Pref: {(biz.partner_preference || "all").replace(/_/g, " ")}
                  </p>
                </div>
                <button
                  onClick={() => triggerMatch(biz.id)}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  {isLoading ? (
                    <>Matching...</>
                  ) : (
                    <><Zap className="size-3" /> Find Matches</>
                  )}
                </button>
              </div>

              {result && (
                <div className="mt-3 border-t pt-3">
                  {result.matchesFound === -1 ? (
                    <div className="flex items-center gap-2 text-sm text-red-500">
                      <AlertCircle className="size-4" /> Error running matching
                    </div>
                  ) : result.matchesFound === 0 ? (
                    <p className="text-sm text-muted-foreground">No new matches available. All eligible creators have already been suggested.</p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-green-600">{result.matchesFound} match{result.matchesFound > 1 ? "es" : ""} found!</p>
                      {result.details.map((d, i) => (
                        <div key={i} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                          <div>
                            <p className="text-sm font-medium">{d.creatorName}</p>
                            <p className="text-xs text-muted-foreground">{d.creatorType} · score: {(d.score * 100).toFixed(0)}%</p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {d.messageSent ? (
                              <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle className="size-3" /> Sent</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">Not sent</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </main>
    </div>
  );
}
