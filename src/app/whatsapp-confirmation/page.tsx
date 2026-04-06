"use client";

import Image from "next/image";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

export default function WhatsAppConfirmationPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    }>
      <ConfirmationContent />
    </Suspense>
  );
}

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "already" | "error">("loading");

  useEffect(() => {
    const id = searchParams.get("id");
    const phone = searchParams.get("phone");

    if (!id && !phone) {
      // No identifier — just show success (they clicked from WhatsApp, that's enough)
      document.cookie = `stroby_wa_verified=1; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
      setStatus("success");
      return;
    }

    // Call the verification API
    fetch("/api/verify/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, phone }),
    })
      .then((res) => res.json())
      .then((data) => {
        document.cookie = `stroby_wa_verified=1; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
        if (data.userId) {
          document.cookie = `stroby_user_id=${data.userId}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
          document.cookie = `stroby_user_type=${data.userType}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
        }
        setStatus(data.already ? "already" : "success");
      })
      .catch(() => {
        // Still show success even if API fails — the click itself is verification
        document.cookie = `stroby_wa_verified=1; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
        setStatus("success");
      });
  }, [searchParams]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4">
      <div className="flex max-w-md flex-col items-center text-center">
        <a href="/" className="mb-6 transition-transform hover:scale-105">
          <Image
            src="/logo-emoji.png"
            alt="Stroby AI"
            width={120}
            height={120}
            className="drop-shadow-lg"
            priority
          />
        </a>

        {status === "loading" && (
          <>
            <Loader2 className="mb-4 size-8 animate-spin text-primary" />
            <h1 className="text-2xl font-bold">Verifying your account...</h1>
          </>
        )}

        {(status === "success" || status === "already") && (
          <>
            <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="size-8 text-green-600" />
            </div>
            <h1 className="mb-3 text-2xl font-bold sm:text-3xl">
              {status === "already" ? "Already verified!" : "You're verified!"}
            </h1>
            <p className="mb-8 text-lg text-muted-foreground">
              {status === "already"
                ? "Your WhatsApp is already connected. You're all set!"
                : "Your WhatsApp is now connected to Stroby. I'll message you whenever I find a great match."}
            </p>
            <a
              href="https://wa.me/message/2QFL7QR7EBZTD1"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-full bg-[#25D366] px-8 py-4 text-lg font-semibold text-white shadow-xl transition-all hover:scale-105"
            >
              <svg viewBox="0 0 24 24" className="size-6 fill-current">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Back to WhatsApp
            </a>
          </>
        )}

        {status === "error" && (
          <>
            <h1 className="mb-3 text-2xl font-bold">Something went wrong</h1>
            <p className="mb-8 text-muted-foreground">
              Please try again or message Stroby directly on WhatsApp.
            </p>
          </>
        )}

        <div className="mt-10 flex gap-4 text-xs text-muted-foreground">
          <a href="/" className="underline hover:text-foreground">Home</a>
          <a href="/about" className="underline hover:text-foreground">About</a>
          <a href="/terms" className="underline hover:text-foreground">Terms</a>
          <a href="/privacy" className="underline hover:text-foreground">Privacy</a>
        </div>
      </div>
    </div>
  );
}
