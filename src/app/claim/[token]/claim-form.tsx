"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface InitialFields {
  name: string;
  contact_name: string;
  email: string;
  niche: string;
}

export default function ClaimForm({
  token,
  profileType,
  initial,
}: {
  token: string;
  profileType: "brand" | "creator";
  initial: InitialFields;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: initial.name,
    contact_name: initial.contact_name,
    phone: "",
    email: initial.email,
    primary_niche: initial.niche,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const payload: Record<string, string> = {
      token,
      phone: form.phone,
    };
    if (form.email) payload.email = form.email;
    if (form.primary_niche) payload.primary_niche = form.primary_niche;
    if (profileType === "brand") {
      if (form.name) payload.company_name = form.name;
      if (form.contact_name) payload.contact_name = form.contact_name;
    } else {
      if (form.name) payload.newsletter_name = form.name;
      if (form.contact_name) payload.owner_name = form.contact_name;
    }

    try {
      const resp = await fetch("/api/shadow/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        setError(
          data.error === "already_claimed"
            ? "This profile is already active on Stroby."
            : data.error === "expired"
              ? "This link has expired."
              : data.error === "invalid_phone"
                ? "Please enter a valid phone number."
                : data.error === "invalid_email"
                  ? "Please enter a valid email."
                  : "Something went wrong. Please try again."
        );
        setSubmitting(false);
        return;
      }
      router.push(`/welcome/${data.id}?type=${profileType === "brand" ? "business" : "newsletter"}&claimed=1`);
    } catch {
      setError("Network error — please try again.");
      setSubmitting(false);
    }
  }

  const nameLabel = profileType === "brand" ? "Company name" : "Newsletter name";
  const contactLabel = profileType === "brand" ? "Your name" : "Your name";

  return (
    <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border bg-background p-6">
      <div>
        <label className="mb-1.5 block text-sm font-medium">{nameLabel}</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          required
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium">{contactLabel}</label>
        <input
          type="text"
          value={form.contact_name}
          onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          required
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium">
          WhatsApp number <span className="text-muted-foreground">(with country code)</span>
        </label>
        <input
          type="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="+1 555 000 0000"
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          required
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Stroby connects you to {profileType === "brand" ? "newsletter creators" : "brand sponsors"} via WhatsApp — this is how you&rsquo;ll hear about matches.
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium">
          Email <span className="text-muted-foreground">(backup channel)</span>
        </label>
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="you@example.com"
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium">
          Primary niche <span className="text-muted-foreground">(optional)</span>
        </label>
        <input
          type="text"
          value={form.primary_niche}
          onChange={(e) => setForm({ ...form, primary_niche: e.target.value })}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {submitting ? "Activating…" : "Activate my profile"}
      </button>

      <p className="text-center text-xs text-muted-foreground">
        By activating, you agree to our{" "}
        <a href="/terms" className="underline">Terms</a>
        {" and "}
        <a href="/privacy" className="underline">Privacy Policy</a>.
      </p>
    </form>
  );
}
