/**
 * /admin/affiliates — admin list with approve buttons.
 *
 * Auth via ?key=ADMIN_PASSWORD query param (matches the existing
 * Stroby admin pattern). Client component because it needs to issue
 * POST requests to approve and re-fetch.
 */
"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";

interface AdminAffiliate {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  bio: string | null;
  network_description: string | null;
  referral_code: string;
  status: string;
  created_at: string;
}

type StatusFilter = "pending" | "active" | "suspended" | "banned";

export default function AdminAffiliatesPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-5xl px-4 py-10">
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        </main>
      }
    >
      <AdminAffiliatesInner />
    </Suspense>
  );
}

function AdminAffiliatesInner() {
  const params = useSearchParams();
  const key = params.get("key") ?? "";
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [affiliates, setAffiliates] = useState<AdminAffiliate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/admin/affiliates?key=${encodeURIComponent(key)}&status=${statusFilter}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load");
      } else {
        setAffiliates(data.affiliates || []);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [key, statusFilter]);

  useEffect(() => {
    if (!key) return;
    load();
  }, [load, key]);

  async function approve(id: string) {
    setActioning(id);
    try {
      const res = await fetch(
        `/api/admin/affiliates/${id}/approve?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ admin_name: "admin" }),
        },
      );
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to approve");
      } else {
        await load();
      }
    } catch {
      alert("Network error");
    } finally {
      setActioning(null);
    }
  }

  if (!key) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <Card>
          <CardHeader>
            <AlertCircle className="size-6 text-destructive" />
            <CardTitle>Missing admin key</CardTitle>
            <CardDescription>
              Append <code className="rounded bg-muted px-1.5 py-0.5">?key=YOUR_ADMIN_PASSWORD</code> to the URL.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Affiliate admin
        </h1>
        <p className="mt-1 text-muted-foreground">
          Review and approve affiliate applications.
        </p>
      </div>

      {/* Status filter */}
      <div className="mb-6 flex gap-2">
        {(["pending", "active", "suspended", "banned"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={
              "rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition " +
              (s === statusFilter
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground")
            }
          >
            {s}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && affiliates.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No affiliates with status &quot;{statusFilter}&quot;
        </p>
      )}

      <div className="flex flex-col gap-4">
        {affiliates.map((a) => (
          <Card key={a.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>{a.full_name}</CardTitle>
                  <CardDescription>
                    {a.email} · {a.phone} · code <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{a.referral_code}</code>
                  </CardDescription>
                </div>
                {statusFilter === "pending" && (
                  <Button
                    onClick={() => approve(a.id)}
                    disabled={actioning === a.id}
                    size="sm"
                  >
                    {actioning === a.id ? (
                      <>
                        <Loader2 className="size-3 animate-spin" /> Approving
                      </>
                    ) : (
                      <>
                        <CheckCircle data-icon="inline-start" /> Approve
                      </>
                    )}
                  </Button>
                )}
              </div>
            </CardHeader>
            {(a.bio || a.network_description) && (
              <CardContent className="space-y-3 text-sm">
                {a.network_description && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Network
                    </p>
                    <p className="mt-1">{a.network_description}</p>
                  </div>
                )}
                {a.bio && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Bio
                    </p>
                    <p className="mt-1">{a.bio}</p>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </main>
  );
}
