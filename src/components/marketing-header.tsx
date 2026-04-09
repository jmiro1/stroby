"use client";

/**
 * MarketingHeader — the about-style sticky header used on every public
 * marketing/content page EXCEPT the homepage.
 *
 * Left side: always the Stroby avatar + wordmark, hyperlinked to /.
 *
 * Right side: a slot. By default it renders a "Get Started" button (the
 * right CTA for pages like /about, /privacy, /terms where the goal is to
 * funnel visitors into the chat-widget onboarding flow). Pages with
 * different conversion goals override the slot:
 *
 *   <MarketingHeader />                       // default: Get Started → /
 *   <MarketingHeader right={null} />          // render nothing on the right
 *   <MarketingHeader right={<MyOwnCTA />} />  // render whatever you want
 *
 * Examples by page:
 *   /about, /privacy, /terms       → default Get Started
 *   /affiliates                     → Sign in + Apply
 *   /affiliates/apply, /login/*     → null (already in the flow)
 *   /contact                        → null (form IS the conversion)
 *   /whatsapp, /whatsapp-confirmation → null (already a conversion surface)
 *   /payment/success, /payment/cancel → null (post-transaction)
 *   /data-deletion                  → null (admin / GDPR flow)
 *
 * Auth-gated dashboards (/affiliates/dashboard/*, /admin/*) and embedded
 * surfaces (/embed/*) keep their own context-specific headers entirely
 * and don't use this component.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

interface MarketingHeaderProps {
  /** Right-side slot. `undefined` → default Get Started button. `null` → render nothing. */
  right?: ReactNode | null;
}

function DefaultGetStarted() {
  return (
    <Link href="/">
      <Button size="default">
        Get Started
        <ArrowRight data-icon="inline-end" />
      </Button>
    </Link>
  );
}

export function MarketingHeader({ right }: MarketingHeaderProps = {}) {
  const rightContent =
    right === null ? null : right === undefined ? <DefaultGetStarted /> : right;
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="relative size-9 overflow-hidden rounded-lg bg-primary">
            <Image
              src="/logo-emoji.png"
              alt="Stroby"
              width={36}
              height={36}
              className="size-full object-cover"
            />
          </div>
          <span className="text-xl font-semibold tracking-tight">Stroby</span>
        </Link>
        {rightContent && <div className="flex items-center gap-3">{rightContent}</div>}
      </div>
    </header>
  );
}
