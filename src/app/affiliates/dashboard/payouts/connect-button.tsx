"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export function ConnectButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/affiliates/me/stripe-connect", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || "Failed to start onboarding");
        setLoading(false);
        return;
      }
      // Navigate to the Stripe-hosted onboarding page
      window.location.href = data.url;
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  return (
    <div>
      <Button onClick={handleClick} disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Opening Stripe...
          </>
        ) : (
          "Connect Stripe"
        )}
      </Button>
      {error && (
        <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
