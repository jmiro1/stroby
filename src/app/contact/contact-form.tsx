"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, Loader2 } from "lucide-react";

interface FormState {
  name: string;
  email: string;
  subject: string;
  message: string;
  honeypot: string; // hidden bot trap
}

const EMPTY: FormState = {
  name: "",
  email: "",
  subject: "",
  message: "",
  honeypot: "",
};

export function ContactForm() {
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
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setSubmitting(false);
      } else {
        setDone(true);
      }
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center">
        <CheckCircle className="mx-auto size-10 text-primary" />
        <h2 className="mt-4 font-heading text-xl font-semibold">Message sent</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Thanks for reaching out — we&apos;ll get back to you within a day or
          so. If it&apos;s urgent, ping us on WhatsApp using the button below.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="name">
          Your name
        </label>
        <Input
          id="name"
          required
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="Jane Doe"
          autoComplete="name"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="email">
          Your email
        </label>
        <Input
          id="email"
          type="email"
          required
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
          placeholder="jane@yourdomain.com"
          autoComplete="email"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="subject">
          Subject (optional)
        </label>
        <Input
          id="subject"
          value={form.subject}
          onChange={(e) => update("subject", e.target.value)}
          placeholder="What's this about?"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="message">
          Message
        </label>
        <Textarea
          id="message"
          required
          value={form.message}
          onChange={(e) => update("message", e.target.value)}
          placeholder="Tell us what's on your mind..."
          rows={6}
        />
      </div>

      {/* Honeypot — visually hidden, real users skip it, bots fill it */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        value={form.honeypot}
        onChange={(e) => update("honeypot", e.target.value)}
        className="hidden"
        aria-hidden="true"
      />

      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <Button type="submit" disabled={submitting} size="lg">
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Sending...
          </>
        ) : (
          "Send message"
        )}
      </Button>
    </form>
  );
}
