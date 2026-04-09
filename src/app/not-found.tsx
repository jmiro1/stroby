/**
 * Custom 404 page — on-brand with the Stroby character and voice.
 * Mirrors the homepage hero pattern (large character image, headline,
 * action button) so it feels like a continuation of the brand, not a
 * dead end.
 */
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MessageCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col bg-background">
      {/* Minimal nav matching the homepage */}
      <header className="flex items-center justify-between px-5 py-4 sm:px-8 sm:py-6">
        <Link
          href="/about"
          className="text-base font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          About
        </Link>
        <div className="flex items-center gap-5">
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
          <a
            href="https://x.com/strobyai"
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
      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-20">
        {/* Character with subtle bobbing animation */}
        <Link
          href="/"
          className="relative mb-8 size-36 overflow-hidden rounded-3xl transition-transform hover:scale-105 sm:size-44"
        >
          <Image
            src="/logo-emoji.png"
            alt="Stroby AI"
            width={176}
            height={176}
            className="size-full -rotate-6 object-contain drop-shadow-lg"
            priority
          />
        </Link>

        {/* Big 404 with character voice */}
        <p className="font-mono text-sm font-medium uppercase tracking-widest text-muted-foreground">
          404
        </p>
        <h1 className="mt-2 text-center text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Hmm, even <span className="text-primary">superconnectors</span> get lost sometimes.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-center text-base text-muted-foreground sm:text-lg">
          The page you&apos;re looking for doesn&apos;t exist (or it wandered
          off). Let me get you back on track.
        </p>

        {/* Actions */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/">
            <Button size="lg">
              <ArrowLeft data-icon="inline-start" />
              Take me home
            </Button>
          </Link>
          <Link href="/about">
            <Button size="lg" variant="outline">
              <MessageCircle data-icon="inline-start" />
              Learn about Stroby
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
