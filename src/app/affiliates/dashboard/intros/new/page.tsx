/**
 * /affiliates/dashboard/intros/new — manual intro form.
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

type Role = "newsletter" | "business" | "other";

export default function NewIntroPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("business");
  const [introNote, setIntroNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/affiliates/me/intros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role, intro_note: introNote }),
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setSubmitting(false);
      } else {
        router.push("/affiliates/dashboard");
      }
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <Link
        href="/affiliates/dashboard"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to dashboard
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Make a manual intro</CardTitle>
          <CardDescription>
            Tell us who you&apos;re introducing. When they sign up using the
            email below, you&apos;ll automatically be credited as their
            introducer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="role">
                What kind of partner is this?
              </label>
              <div className="flex gap-2">
                <RoleButton current={role} value="business" onClick={setRole}>
                  Brand / Business
                </RoleButton>
                <RoleButton current={role} value="newsletter" onClick={setRole}>
                  Newsletter
                </RoleButton>
                <RoleButton current={role} value="other" onClick={setRole}>
                  Creator
                </RoleButton>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="name">
                Name
              </label>
              <Input
                id="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  role === "business"
                    ? "Acme Corp"
                    : role === "newsletter"
                    ? "Sarah's AI Weekly"
                    : "Sarah Chen"
                }
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@example.com"
              />
              <p className="text-xs text-muted-foreground">
                Attribution binds when this exact email signs up. Make sure
                it&apos;s the address they&apos;ll actually use.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="intro_note">
                Intro note (optional)
              </label>
              <Textarea
                id="intro_note"
                value={introNote}
                onChange={(e) => setIntroNote(e.target.value)}
                placeholder="A few sentences for our records about who they are and why they'd be a fit..."
                rows={4}
              />
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit intro"}
            </Button>

            <p className="text-xs text-muted-foreground">
              The intro stays pending for 90 days. If they haven&apos;t signed
              up by then, the row expires.
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function RoleButton({
  value,
  current,
  onClick,
  children,
}: {
  value: Role;
  current: Role;
  onClick: (v: Role) => void;
  children: React.ReactNode;
}) {
  const active = value === current;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={
        "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition " +
        (active
          ? "border-primary bg-primary/10 text-primary"
          : "border-input bg-background text-muted-foreground hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}
