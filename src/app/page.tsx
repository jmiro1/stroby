"use client";

import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import OnboardingChat from "@/components/onboarding-chat";

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
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            About
          </Link>
          <div className="flex items-center gap-5">
            {/* LinkedIn */}
            <a
              href="https://linkedin.com/company/stroby-ai"
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
          {/* Character image */}
          <div className="relative mb-6 size-32 sm:size-40">
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
          </div>

          {/* Headline */}
          <h1 className="text-center text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Hey, I&apos;m Stroby
          </h1>
          <p className="mt-3 max-w-md text-center text-lg text-muted-foreground sm:text-xl">
            Your AI newsletter sponsorship matchmaker.
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
    </div>
  );
}
