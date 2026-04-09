/**
 * /affiliates/login — phone entry, requests a WhatsApp magic link.
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { MarketingHeader } from "@/components/marketing-header";
import { SiteFooter } from "@/components/site-footer";

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/affiliates/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setSubmitting(false);
      } else {
        router.push("/affiliates/login/sent");
      }
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-background">
      <MarketingHeader right={null} />
      <div className="mx-auto w-full max-w-md flex-1 px-4 py-16">
        <Link
          href="/affiliates"
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back
        </Link>

        <Card>
          <CardHeader>
            <MessageSquare className="size-6 text-primary" />
            <CardTitle>Sign in via WhatsApp</CardTitle>
            <CardDescription>
              Enter the phone number you used when you applied. We&apos;ll send
              you a one-time sign-in link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" htmlFor="phone">
                  Phone number
                </label>
                <Input
                  id="phone"
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+15551234567"
                  autoFocus
                />
              </div>

              {error && (
                <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button type="submit" disabled={submitting}>
                {submitting ? "Sending..." : "Send sign-in link"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Not yet an affiliate?{" "}
          <Link href="/affiliates/apply" className="text-primary hover:underline">
            Apply
          </Link>
        </p>
      </div>
      <SiteFooter />
    </main>
  );
}
