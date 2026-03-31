"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Clock,
  Sparkles,
  Shield,
  CheckCircle,
  Copy,
  Share2,
  ExternalLink,
  Users,
  Mail,
  Lock,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface WelcomeContentProps {
  profile: any;
  userType: "newsletter" | "business";
  profileId: string;
  nicheCounts: { businesses: number; newsletters: number };
}

export default function WelcomeContent({
  profile,
  userType,
  profileId,
  nicheCounts,
}: WelcomeContentProps) {
  const [copied, setCopied] = useState(false);

  const referralLink = `https://stroby.ai?ref=${profileId}`;

  const name =
    userType === "newsletter"
      ? profile.newsletter_name
      : profile.company_name;

  const niche =
    userType === "newsletter"
      ? profile.niches?.[0] ?? "your niche"
      : profile.primary_niche ?? "your niche";

  const shareTextNewsletter = `I just joined @strobyai — an AI-powered marketplace that matches newsletters with vetted sponsors. Free to join, escrow-protected payments. Check it out: ${referralLink}`;
  const shareTextBusiness = `Found a great tool for newsletter sponsorships — @strobyai uses AI to match you with verified newsletters. Escrow payments and placement guarantees. ${referralLink}`;
  const shareText =
    userType === "newsletter" ? shareTextNewsletter : shareTextBusiness;

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(referralLink)}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const textarea = document.createElement("textarea");
      textarea.value = referralLink;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-primary/10">
            <CheckCircle className="size-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            Welcome to Stroby, {name}!
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            {userType === "newsletter"
              ? "You're now part of our sponsor matching network."
              : "We're finding the perfect newsletters for your brand."}
          </p>
        </div>
      </section>

      {/* What happens next */}
      <section className="border-t bg-muted/30 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            What happens next
          </h2>
          <div className="mt-12 space-y-8">
            {userType === "newsletter" ? (
              <>
                <TimelineItem
                  icon={Sparkles}
                  time="Now"
                  title="Your profile is live"
                  description="Our AI is already scanning for sponsors that match your niche."
                />
                <TimelineItem
                  icon={Clock}
                  time="Within 48 hours"
                  title="First match incoming"
                  description="You'll receive your first sponsor match suggestion via WhatsApp."
                />
                <TimelineItem
                  icon={CheckCircle}
                  time="Ongoing"
                  title="Sit back and earn"
                  description="Sit back — we'll send you vetted sponsor opportunities as they come in."
                />
              </>
            ) : (
              <>
                <TimelineItem
                  icon={Sparkles}
                  time="Now"
                  title="Matching in progress"
                  description={`Our AI is analyzing newsletters in ${niche} for the best fit.`}
                />
                <TimelineItem
                  icon={Clock}
                  time="Within 48 hours"
                  title="Your first match"
                  description="You'll receive your first match with verified metrics and pricing."
                />
                <TimelineItem
                  icon={CheckCircle}
                  time="When you're ready"
                  title="Book with confidence"
                  description="Accept a match and we'll handle the intro, payment, and tracking."
                />
              </>
            )}
          </div>
        </div>
      </section>

      {/* Type-specific card */}
      {userType === "newsletter" ? (
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <div className="rounded-xl border bg-card p-6 sm:p-8">
              <h3 className="text-xl font-bold">Boost your profile</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Take these steps to increase your chances of getting matched
                with premium sponsors.
              </p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Link
                  href={`/verify/${profileId}`}
                  className="flex items-start gap-4 rounded-lg border p-4 transition-shadow hover:shadow-md"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <BarChart3 className="size-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">Verify your metrics</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Connect your ESP to prove your subscriber count and
                      open rates.
                    </p>
                  </div>
                  <ExternalLink className="ml-auto mt-1 size-4 shrink-0 text-muted-foreground" />
                </Link>
                <div className="flex items-start gap-4 rounded-lg border p-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Lock className="size-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">Connect Stripe</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      We&apos;ll guide you through Stripe setup via WhatsApp
                      so you can get paid securely.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <div className="rounded-xl border bg-card p-6 sm:p-8">
              <h3 className="text-xl font-bold">How you&apos;re protected</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Every sponsorship on Stroby comes with built-in guarantees.
              </p>
              <div className="mt-6 space-y-4">
                <ProtectionItem
                  icon={Lock}
                  title="Escrow payments"
                  description="Your money is held until the placement runs."
                />
                <ProtectionItem
                  icon={Shield}
                  title="Placement guarantee"
                  description="Partial refund if metrics fall short."
                />
                <ProtectionItem
                  icon={BarChart3}
                  title="Independent tracking"
                  description="We verify results with our own UTM links."
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Network stats */}
      <section className="border-t bg-muted/30 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h3 className="text-center text-xl font-bold">Network stats</h3>
          {nicheCounts.businesses === 0 && nicheCounts.newsletters <= 1 ? (
            <div className="mt-8 text-center">
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10">
                <Users className="size-6 text-primary" />
              </div>
              <p className="font-semibold text-foreground">
                You&apos;re one of our founding members!
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                We&apos;re onboarding new{" "}
                {userType === "newsletter" ? "businesses" : "newsletters"}{" "}
                every day. You&apos;ll be among the first to get matched.
              </p>
            </div>
          ) : (
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border bg-card p-6 text-center">
                <p className="text-3xl font-bold text-primary">
                  {userType === "newsletter"
                    ? nicheCounts.businesses
                    : nicheCounts.newsletters}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {userType === "newsletter"
                    ? "Businesses in your niche"
                    : "Newsletters on the platform"}
                </p>
              </div>
              <div className="rounded-xl border bg-card p-6 text-center">
                <p className="text-3xl font-bold text-primary">
                  {nicheCounts.newsletters}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Total newsletters on Stroby
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Referral section */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="rounded-xl border bg-card p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Share2 className="size-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold">Spread the word</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Know other{" "}
                  {userType === "newsletter"
                    ? "newsletter owners"
                    : "businesses"}
                  ? Invite them to Stroby.
                </p>
              </div>
            </div>

            <div className="mt-6">
              <label className="mb-2 block text-sm font-medium text-muted-foreground">
                Your referral link
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={referralLink}
                  className="h-9 flex-1 rounded-lg border bg-muted/50 px-3 text-sm text-foreground"
                />
                <Button
                  variant="outline"
                  size="default"
                  onClick={handleCopy}
                  className="shrink-0"
                >
                  {copied ? (
                    <>
                      <CheckCircle className="size-4 text-green-600" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="size-4" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <a
                href={twitterUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors hover:bg-muted"
              >
                <svg
                  className="size-4"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                Share on X
              </a>
              <a
                href={linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors hover:bg-muted"
              >
                <svg
                  className="size-4"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
                Share on LinkedIn
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer link */}
      <section className="border-t py-8 text-center">
        <Link
          href="/"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Back to home
        </Link>
      </section>

      <style jsx>{`
        .animate-fade-in {
          animation: fadeIn 0.5s ease-out;
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

function TimelineItem({
  icon: Icon,
  time,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  time: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Icon className="size-5 text-primary" />
        </div>
        <div className="mt-2 flex-1 border-l-2 border-dashed border-primary/20" />
      </div>
      <div className="pb-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-primary">
          {time}
        </span>
        <h4 className="mt-1 font-semibold">{title}</h4>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function ProtectionItem({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-lg border p-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="size-5 text-primary" />
      </div>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
