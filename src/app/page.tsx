"use client";

import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import OnboardingChat from "@/components/onboarding-chat";
import { HowItWorks } from "@/components/how-it-works";

export default function HomePage() {
  const chatRef = useRef<HTMLDivElement>(null);

  function scrollToChat() {
    chatRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="bg-background">
      {/* ── Hero screen ── */}
      <div className="flex min-h-dvh flex-col">
        {/* Nav */}
        <header className="flex items-center justify-between px-5 py-4 sm:px-8 sm:py-6">
          <Link
            href="/about"
            className="text-base font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            About
          </Link>
          <div className="flex items-center gap-5">
            {/* LinkedIn */}
            <a
              href="https://www.linkedin.com/company/stroby"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="LinkedIn"
            >
              <svg viewBox="0 0 24 24" className="size-5 fill-current">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </a>
            {/* X / Twitter */}
            <a
              href="https://x.com/stroby_ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="X"
            >
              <svg viewBox="0 0 24 24" className="size-5 fill-current">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          </div>
        </header>

        {/* Center content */}
        <main className="flex flex-1 flex-col items-center justify-center px-4">
          {/* Character image — links home */}
          <Link href="/" className="relative mb-6 size-32 overflow-hidden rounded-3xl transition-transform hover:scale-105 sm:size-40">
            <Image
              src="/logo-emoji.png"
              alt="Stroby AI"
              width={160}
              height={160}
              className="size-full object-contain drop-shadow-lg"
              priority
              onError={(e) => {
                const target = e.currentTarget;
                target.style.display = "none";
                if (target.parentElement) {
                  target.parentElement.innerHTML =
                    '<div class="flex size-full items-center justify-center rounded-full bg-primary/10"><svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-primary"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg></div>';
                }
              }}
            />
          </Link>

          {/* Headline */}
          <h1 className="text-center text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Hey, I&apos;m <span className="text-primary">Stroby</span>
          </h1>
          <p className="mt-3 max-w-md text-center text-lg text-muted-foreground sm:text-xl">
            Your AI Superconnector for brand distribution.
          </p>

          {/* Message button */}
          <button
            onClick={scrollToChat}
            className="group mt-10 flex flex-col items-center gap-3 transition-opacity hover:opacity-80"
          >
            <span className="rounded-full bg-primary px-8 py-3 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-transform group-hover:scale-105">
              Message
            </span>
            {/* Animated arrow */}
            <svg
              viewBox="0 0 24 24"
              className="size-6 animate-bounce text-primary"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14" />
              <path d="m19 12-7 7-7-7" />
            </svg>
          </button>
        </main>
      </div>

      {/* ── Chat section ── */}
      <div ref={chatRef} className="mx-auto max-w-[420px] px-4 pb-16 pt-8">
        <div className="overflow-hidden rounded-[2.5rem] border-[6px] border-foreground/10 bg-background shadow-2xl shadow-primary/10">
          {/* Phone notch */}
          <div className="flex h-7 items-center justify-center bg-foreground/5">
            <div className="h-1.5 w-20 rounded-full bg-foreground/10" />
          </div>

          {/* Chat */}
          <div className="h-[540px] sm:h-[580px]">
            <OnboardingChat />
          </div>

          {/* Phone bottom bar */}
          <div className="flex h-5 items-center justify-center bg-foreground/5">
            <div className="h-1 w-28 rounded-full bg-foreground/15" />
          </div>
        </div>
      </div>

      {/* How It Works — 20 second animation */}
      <section className="border-t py-16">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">How it works</h2>
            <p className="mt-2 text-muted-foreground">Double opt-in. Contact only shared when both sides agree.</p>
          </div>
          <HowItWorks />
        </div>
      </section>

      {/* WhatsApp CTA */}
      <section className="border-t py-12">
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 text-center">
          <p className="text-lg font-semibold">Onboard on this page, or message Stroby directly on WhatsApp</p>
          <a
            href="https://wa.me/message/2QFL7QR7EBZTD1"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-full bg-[#25D366] px-6 py-3 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-105"
          >
            <svg viewBox="0 0 24 24" className="size-5 fill-current">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Open WhatsApp
          </a>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent("https://wa.me/message/2QFL7QR7EBZTD1")}&bgcolor=ffffff&color=000000&margin=8`}
            alt="Scan to message Stroby on WhatsApp"
            width={140}
            height={140}
            className="rounded-xl border bg-white p-1"
          />
          <p className="text-xs text-muted-foreground">Scan to message Stroby</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <Link href="/" className="flex items-center gap-2">
              <div className="relative size-7 overflow-hidden rounded-md bg-primary">
                <Image
                  src="/logo-emoji.png"
                  alt="Stroby"
                  width={28}
                  height={28}
                  className="size-full object-cover"
                />
              </div>
              <span className="text-base font-semibold">Stroby.ai</span>
            </Link>
            <nav className="flex gap-6 text-base text-muted-foreground">
              <Link href="/privacy" className="transition-colors hover:text-foreground">
                Privacy
              </Link>
              <Link href="/terms" className="transition-colors hover:text-foreground">
                Terms
              </Link>
              <Link href="/affiliates" className="transition-colors hover:text-foreground">
                Affiliates
              </Link>
              <a href="mailto:hello@stroby.ai" className="transition-colors hover:text-foreground">
                Contact
              </a>
            </nav>
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} Stroby. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
