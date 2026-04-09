/**
 * /affiliates/apply — application form (client component).
 */
"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle, ArrowLeft, AlertTriangle } from "lucide-react";
import { MarketingHeader } from "@/components/marketing-header";
import { SiteFooter } from "@/components/site-footer";
import { WhatsAppCTA } from "@/components/whatsapp-cta";

interface FormState {
  full_name: string;
  email: string;
  phone: string;
  network_description: string;
  bio: string;
}

const EMPTY: FormState = {
  full_name: "",
  email: "",
  phone: "",
  network_description: "",
  bio: "",
};

export default function ApplyPage() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function update<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((f) => ({ ...f, [key]: val }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/affiliates/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
      } else {
        setDone(true);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <main className="flex min-h-dvh flex-col bg-background">
        <MarketingHeader right={null} />
        <div className="mx-auto w-full max-w-xl px-4 py-16">
          <Card>
            <CardHeader>
              <CheckCircle className="size-8 text-primary" />
              <CardTitle>Application received</CardTitle>
              <CardDescription>
                Thanks for applying — we hand-review every application and a
                real human will get back to you within 24 hours.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p>
                You&apos;ll receive a <strong>confirmation email shortly</strong>{" "}
                so you can keep an eye on your application status. When
                you&apos;re approved we&apos;ll also send a WhatsApp message
                with your personal referral link.
              </p>
              <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-900 dark:text-amber-200">
                <AlertTriangle className="size-5 shrink-0" />
                <div>
                  <p className="font-medium">Check your spam &amp; promotions folders.</p>
                  <p className="mt-1 text-xs">
                    Move our email to your primary inbox and mark it &quot;Not
                    spam&quot; so you don&apos;t miss the approval and the link
                    to your dashboard.
                  </p>
                </div>
              </div>
              <Link href="/">
                <Button variant="outline">Back to Stroby</Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* While they wait — onboard with Stroby on WhatsApp */}
        <WhatsAppCTA headline="While we review, get a head start by onboarding with Stroby on WhatsApp" />

        <SiteFooter />
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col bg-background">
      <MarketingHeader right={null} />
      <div className="mx-auto w-full max-w-xl flex-1 px-4 py-12">
        <Link
          href="/affiliates"
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back
        </Link>

        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Apply to the Stroby Affiliate Program
        </h1>
        <p className="mt-2 text-muted-foreground">
          Tell us a bit about yourself. Approval usually takes 24 hours.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="full_name">
              Full name
            </label>
            <Input
              id="full_name"
              required
              value={form.full_name}
              onChange={(e) => update("full_name", e.target.value)}
              placeholder="Jane Doe"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="email">
              Email
            </label>
            <Input
              id="email"
              type="email"
              required
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="jane@yourdomain.com"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="phone">
              Phone (with country code)
            </label>
            <Input
              id="phone"
              type="tel"
              required
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="+15551234567"
            />
            <p className="text-xs text-muted-foreground">
              We&apos;ll send your sign-in link and notifications via WhatsApp to this number.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="network_description">
              Tell us about your network
            </label>
            <Textarea
              id="network_description"
              required
              value={form.network_description}
              onChange={(e) => update("network_description", e.target.value)}
              placeholder="I run a newsletter sponsorship agency. I work with ~30 B2B SaaS brands and ~50 mid-tier creators across dev tools and AI..."
              rows={5}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="bio">
              Short bio (optional)
            </label>
            <Textarea
              id="bio"
              value={form.bio}
              onChange={(e) => update("bio", e.target.value)}
              placeholder="Two sentences about who you are and why this matters to you."
              rows={3}
            />
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" disabled={submitting} size="lg">
            {submitting ? "Submitting..." : "Submit application"}
          </Button>

          <p className="text-xs text-muted-foreground">
            By applying you agree to our affiliate terms. Approval is at our
            discretion. We may follow up via WhatsApp before approving.
          </p>
        </form>
      </div>
      <SiteFooter />
    </main>
  );
}
