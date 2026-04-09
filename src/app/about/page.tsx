"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  MessageSquare,
  Sparkles,
  Shield,
  DollarSign,
  Users,
  CheckCircle,
  BarChart3,
  Lock,
  Target,
  ArrowRight,
} from "lucide-react";

export default function AboutPage() {
  return (
    <>
      {/* Navigation */}
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
            <span className="text-xl font-semibold tracking-tight">
              Stroby
            </span>
          </Link>
          <Link href="/">
            <Button size="default">
              Get Started
              <ArrowRight data-icon="inline-end" />
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:py-36">
            <div className="mx-auto max-w-3xl text-center">
              <Badge variant="secondary" className="mb-6">
                AI-Powered Matching
              </Badge>
              <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                Chat with me, <span className="text-primary">Stroby</span>.
                I&apos;ll connect you with perfect influencers and businesses.
              </h1>
              <p className="mt-6 text-xl text-muted-foreground sm:text-2xl">
                AI-powered matching with verified metrics that get better with every interaction.
              </p>
              <div className="mt-10">
                <Link href="/">
                  <Button size="lg">
                    Get Started
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="border-t bg-muted/30 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                How it works
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                From sign-up to your first match in three simple steps.
              </p>
            </div>
            <div className="mt-16 grid gap-8 sm:grid-cols-3">
              {[
                {
                  icon: MessageSquare,
                  step: "1",
                  title: "Sign up in 5 minutes",
                  description:
                    "Tell our AI about yourself through a quick chat.",
                },
                {
                  icon: Sparkles,
                  step: "2",
                  title: "Get matched instantly",
                  description:
                    "Our AI finds the perfect partners based on niche, audience, and budget.",
                },
                {
                  icon: Shield,
                  step: "3",
                  title: "Book with confidence",
                  description:
                    "Escrow payments and placement guarantees protect both sides.",
                },
              ].map((item) => (
                <div key={item.step} className="relative text-center">
                  <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary/10">
                    <item.icon className="size-8 text-primary" />
                  </div>
                  <span className="mb-2 inline-block text-sm font-semibold uppercase tracking-wider text-primary">
                    Step {item.step}
                  </span>
                  <h3 className="text-xl font-semibold">{item.title}</h3>
                  <p className="mt-2 text-base text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* For Influencers Section */}
        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div>
                <Badge variant="outline" className="mb-4 text-base px-4 py-1.5">
                  For Influencers &amp; Creators
                </Badge>
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  Turn your audience into revenue
                </h2>
                <p className="mt-4 text-lg text-muted-foreground">
                  Join Stroby for free and let AI bring vetted brands directly
                  to you. No outreach needed.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  {
                    icon: DollarSign,
                    title: "Free to join",
                    description: "No upfront cost to get started. We work on fees when proper placements are made and everyone's happy.",
                  },
                  {
                    icon: Sparkles,
                    title: "Passive brand deals",
                    description: "AI finds sponsors for you automatically.",
                  },
                  {
                    icon: CheckCircle,
                    title: "Vetted brands only",
                    description:
                      "Every business is reviewed for quality and fit.",
                  },
                  {
                    icon: Lock,
                    title: "Guaranteed payment",
                    description:
                      "Escrow protection means you always get paid.",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="rounded-xl border bg-card p-8 transition-shadow hover:shadow-md"
                  >
                    <div className="mb-4 flex size-14 items-center justify-center rounded-xl bg-primary/10">
                      <item.icon className="size-7 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold">{item.title}</h3>
                    <p className="mt-2 text-base text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* For Businesses Section */}
        <section className="border-t bg-muted/30 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div className="order-2 grid gap-4 sm:grid-cols-2 lg:order-1">
                {[
                  {
                    icon: Target,
                    title: "AI-powered matching",
                    description:
                      "Find the right influencers instantly with smart AI.",
                  },
                  {
                    icon: BarChart3,
                    title: "Verified metrics",
                    description:
                      "Real audience data you can trust, verified by API.",
                  },
                  {
                    icon: Shield,
                    title: "Placement guarantee",
                    description:
                      "If metrics fall short, get a partial or full refund.",
                  },
                  {
                    icon: Users,
                    title: "No media buyer needed",
                    description:
                      "Stroby handles matching, booking, and verification.",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="rounded-xl border bg-card p-8 transition-shadow hover:shadow-md"
                  >
                    <div className="mb-4 flex size-14 items-center justify-center rounded-xl bg-primary/10">
                      <item.icon className="size-7 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold">{item.title}</h3>
                    <p className="mt-2 text-base text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>
              <div className="order-1 lg:order-2">
                <Badge variant="outline" className="mb-4 text-base px-4 py-1.5">
                  For Businesses
                </Badge>
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  Reach your ideal audience, guaranteed
                </h2>
                <p className="mt-4 text-lg text-muted-foreground">
                  Skip the guesswork. Stroby matches you with verified
                  influencers that fit your niche, audience, and budget.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Trust Signals Bar */}
        <section className="border-y bg-primary/5 py-12">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid gap-8 sm:grid-cols-3">
              {[
                { icon: Lock, label: "Payments held in escrow" },
                { icon: BarChart3, label: "Verified audience metrics" },
                { icon: Shield, label: "Placement guarantee" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-center gap-3"
                >
                  <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
                    <item.icon className="size-6 text-primary" />
                  </div>
                  <span className="text-lg font-medium">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Frequently asked questions
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Everything you need to know about Stroby.
              </p>
            </div>
            <div className="mt-12">
              <Accordion>
                <AccordionItem>
                  <AccordionTrigger>How does Stroby work?</AccordionTrigger>
                  <AccordionContent>
                    <p>
                      Stroby uses AI to match businesses with the most relevant
                      influencers and creators based on niche, audience demographics, and
                      budget. Both sides opt in before a deal is made. Payments
                      are held in escrow until the placement runs and proof of
                      performance is submitted.
                    </p>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem>
                  <AccordionTrigger>How much does it cost?</AccordionTrigger>
                  <AccordionContent>
                    <p>
                      Stroby is completely free for influencers and creators. For
                      businesses, we charge a 15% commission on each transaction.
                      There are no upfront fees, subscriptions, or hidden costs.
                    </p>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem>
                  <AccordionTrigger>
                    How do you verify metrics?
                  </AccordionTrigger>
                  <AccordionContent>
                    <p>
                      We use direct API integrations with major platforms to pull
                      real subscriber and engagement data. For platforms without
                      API access, we use verified screenshot submissions with
                      timestamp validation.
                    </p>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem>
                  <AccordionTrigger>
                    What&apos;s the placement guarantee?
                  </AccordionTrigger>
                  <AccordionContent>
                    <p>
                      If actual performance metrics fall
                      significantly short of what was promised, Stroby will issue a partial or full
                      refund to the business from the escrowed funds.
                    </p>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem>
                  <AccordionTrigger>
                    How does the escrow system work?
                  </AccordionTrigger>
                  <AccordionContent>
                    <p>
                      When a partnership is booked, the business pays into
                      Stroby&apos;s escrow. The funds are held securely while the
                      placement runs. Once proof of placement is submitted and metrics are verified, the funds are released
                      to the influencer.
                    </p>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem>
                  <AccordionTrigger>
                    How long does matching take?
                  </AccordionTrigger>
                  <AccordionContent>
                    <p>
                      Most users receive their first match within 48 hours of
                      completing onboarding. For popular niches, matches can come
                      in within minutes.
                    </p>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem>
                  <AccordionTrigger>
                    What niches do you support?
                  </AccordionTrigger>
                  <AccordionContent>
                    <p>
                      Stroby currently supports SaaS, Marketing, Sales, Fintech,
                      AI, E-commerce, Design, and more. We&apos;re continuously
                      expanding. If your niche isn&apos;t listed,
                      sign up anyway and our AI will find you the best
                      possible matches.
                    </p>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem>
                  <AccordionTrigger>
                    Can I use Stroby if I&apos;m an agency?
                  </AccordionTrigger>
                  <AccordionContent>
                    <p>
                      Yes! Agencies are welcome. You can onboard each
                      of your clients individually, manage multiple campaigns,
                      and take advantage of our AI matching across all of your
                      accounts.
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t bg-primary/5 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Join the fastest growing network of brands and influencers.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
              Whether you&apos;re a solo creator or a Fortune 500, Stroby levels the playing field. No minimum audience size, no gatekeeping — just smart AI matching that works for everyone.
            </p>
            <div className="mt-10">
              <Link href="/">
                <Button size="lg">
                  Get Started
                  <ArrowRight data-icon="inline-end" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="relative size-7 overflow-hidden rounded-md bg-primary">
                <Image
                  src="/logo-emoji.png"
                  alt="Stroby"
                  width={28}
                  height={28}
                  className="size-full object-cover"
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.style.display = "none";
                    if (target.parentElement) {
                      target.parentElement.innerHTML =
                        '<div class="flex size-full items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary-foreground"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg></div>';
                    }
                  }}
                />
              </div>
              <span className="text-base font-semibold">Stroby.ai</span>
            </div>
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
              <Link href="/contact" className="transition-colors hover:text-foreground">
                Contact
              </Link>
            </nav>
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} Stroby. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
