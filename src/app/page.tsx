"use client";

import Link from "next/link";
import Image from "next/image";
import { Zap } from "lucide-react";
import OnboardingChat from "@/components/onboarding-chat";

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-background via-background to-primary/5">
      {/* Minimal header */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="relative size-9 overflow-hidden rounded-lg bg-primary">
            <Image
              src="/logo-emoji.png"
              alt="Stroby"
              width={36}
              height={36}
              className="size-full object-cover"
              onError={(e) => {
                const target = e.currentTarget;
                target.style.display = "none";
                if (target.parentElement) {
                  target.parentElement.innerHTML =
                    '<div class="flex size-full items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary-foreground"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg></div>';
                }
              }}
            />
          </div>
          <span className="text-xl font-semibold tracking-tight">Stroby</span>
        </div>
        <Link
          href="/about"
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          About
        </Link>
      </header>

      {/* Main content */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 pb-12 pt-4 sm:px-6">
        {/* Hero text */}
        <div className="mb-8 max-w-xl text-center sm:mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Find your perfect newsletter sponsorship match
          </h1>
          <p className="mt-3 text-base text-muted-foreground sm:text-lg">
            AI-powered matching. Verified metrics. Payment guaranteed.
          </p>
        </div>

        {/* Phone mockup */}
        <div className="w-full max-w-[380px]">
          <div className="overflow-hidden rounded-[2.5rem] border-[6px] border-foreground/10 bg-background shadow-2xl shadow-primary/10">
            {/* Phone notch */}
            <div className="flex h-7 items-center justify-center bg-foreground/5">
              <div className="h-1.5 w-20 rounded-full bg-foreground/10" />
            </div>

            {/* Chat container */}
            <div className="h-[520px] sm:h-[560px]">
              <OnboardingChat />
            </div>

            {/* Phone bottom bar */}
            <div className="flex h-5 items-center justify-center bg-foreground/5">
              <div className="h-1 w-28 rounded-full bg-foreground/15" />
            </div>
          </div>
        </div>

        {/* Subtle trust text */}
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Trusted by newsletter owners and B2B marketers.{" "}
          <Link href="/about" className="underline underline-offset-2 hover:text-foreground">
            Learn more
          </Link>
        </p>
      </main>
    </div>
  );
}
