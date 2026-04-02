"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const WA_LINK = "https://wa.me/message/2QFL7QR7EBZTD1";

export default function WhatsAppPage() {
  const [clicked, setClicked] = useState(false);
  const linkRef = useRef<HTMLAnchorElement>(null);

  // Set conversion cookie + track click
  function handleClick() {
    const now = Date.now();
    document.cookie = `stroby_wa_click=${now}; path=/; max-age=${60 * 60 * 24 * 90}; SameSite=Lax`;
    document.cookie = `stroby_wa_src=${encodeURIComponent(window.location.search)}; path=/; max-age=${60 * 60 * 24 * 90}; SameSite=Lax`;
    setClicked(true);
  }

  // Grab UTM params from URL and store them in cookie too
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const utm = {
      source: params.get("utm_source"),
      medium: params.get("utm_medium"),
      campaign: params.get("utm_campaign"),
    };
    if (utm.source || utm.medium || utm.campaign) {
      document.cookie = `stroby_utm=${encodeURIComponent(JSON.stringify(utm))}; path=/; max-age=${60 * 60 * 24 * 90}; SameSite=Lax`;
    }
  }, []);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4">
      <div className="flex max-w-md flex-col items-center text-center">
        {/* Stroby character */}
        <Image
          src="/logo-emoji.png"
          alt="Stroby AI"
          width={160}
          height={160}
          className="mb-6 drop-shadow-lg"
          priority
        />

        <h1 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">
          Hey, I&apos;m Stroby!
        </h1>

        <p className="mb-8 text-lg text-muted-foreground">
          Your AI Superconnector for brand distribution. I match businesses with
          the perfect influencers and newsletters through real conversations on
          WhatsApp.
        </p>

        {/* WhatsApp CTA */}
        <a
          ref={linkRef}
          href={WA_LINK}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleClick}
          className="flex items-center gap-3 rounded-full bg-[#25D366] px-8 py-4 text-lg font-semibold text-white shadow-xl transition-all hover:scale-105 hover:shadow-2xl active:scale-100"
        >
          <svg viewBox="0 0 24 24" className="size-6 fill-current">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          Message me on WhatsApp
        </a>

        {clicked && (
          <p className="mt-4 text-sm text-muted-foreground animate-in fade-in">
            Opening WhatsApp...
          </p>
        )}

        <p className="mt-10 text-sm text-muted-foreground">
          Free to use. No spam. Just real connections.
        </p>

        {/* Trust / links */}
        <div className="mt-6 flex gap-4 text-xs text-muted-foreground">
          <a href="/" className="underline hover:text-foreground">Home</a>
          <a href="/about" className="underline hover:text-foreground">About</a>
          <a href="/terms" className="underline hover:text-foreground">Terms</a>
          <a href="/privacy" className="underline hover:text-foreground">Privacy</a>
        </div>
      </div>
    </div>
  );
}
