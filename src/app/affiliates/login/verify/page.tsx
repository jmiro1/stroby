/**
 * /affiliates/login/verify — magic-link landing page.
 *
 * Reads the `?t=TOKEN` query param, POSTs it to /api/affiliates/login/verify,
 * the API sets the session cookie via Set-Cookie header on success, then
 * redirects to /affiliates/dashboard.
 */
"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, CheckCircle } from "lucide-react";

type Status = "verifying" | "success" | "error";

export default function VerifyPage() {
  return (
    <Suspense fallback={<VerifyFallback />}>
      <VerifyInner />
    </Suspense>
  );
}

function VerifyFallback() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-4 py-16">
        <Card>
          <CardHeader>
            <Loader2 className="size-6 animate-spin text-primary" />
            <CardTitle>Loading...</CardTitle>
          </CardHeader>
        </Card>
      </div>
    </main>
  );
}

function VerifyInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("t");

  const [status, setStatus] = useState<Status>("verifying");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError("No token in URL. Try requesting a new sign-in link.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/affiliates/login/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
          // Cookies set by the API are accepted automatically
          credentials: "same-origin",
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setStatus("error");
          setError(data.error || "Sign-in failed.");
          return;
        }
        setStatus("success");
        // Brief pause so the user sees confirmation, then redirect
        setTimeout(() => router.push("/affiliates/dashboard"), 600);
      } catch {
        if (cancelled) return;
        setStatus("error");
        setError("Network error. Please try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-4 py-16">
        <Card>
          <CardHeader>
            {status === "verifying" && <Loader2 className="size-6 animate-spin text-primary" />}
            {status === "success" && <CheckCircle className="size-6 text-primary" />}
            {status === "error" && <AlertCircle className="size-6 text-destructive" />}
            <CardTitle>
              {status === "verifying" && "Signing you in..."}
              {status === "success" && "Signed in"}
              {status === "error" && "Sign-in failed"}
            </CardTitle>
            <CardDescription>
              {status === "verifying" && "One moment while we verify your link."}
              {status === "success" && "Redirecting to your dashboard..."}
              {status === "error" && error}
            </CardDescription>
          </CardHeader>
          {status === "error" && (
            <CardContent>
              <Link href="/affiliates/login">
                <Button variant="outline">Request a new link</Button>
              </Link>
            </CardContent>
          )}
        </Card>
      </div>
    </main>
  );
}
