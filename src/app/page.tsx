"use client";

import { useState } from "react";
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
  Zap,
  Lock,
  Target,
  ArrowRight,
  Mail,
} from "lucide-react";
import ChatWidget from "@/components/chat-widget";

type UserType = "newsletter" | "business" | null;

export default function HomePage() {
  const [chatOpen, setChatOpen] = useState(false);
  const [userType, setUserType] = useState<UserType>(null);

  function openChat(type: UserType) {
    setUserType(type);
    setChatOpen(true);
  }

  return (
    <>
      {/* Navigation */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
              <Zap className="size-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight">
              Stroby
            </span>
          </div>
          <Button size="sm" onClick={() => openChat("business")}>
            Get Started
          </Button>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:py-36">
            <div className="mx-auto max-w-3xl text-center">
              <Badge variant="secondary" className="mb-6">
                AI-Powered Sponsorship Matching
              </Badge>
              <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                Find your perfect newsletter sponsorship match{" "}
                <span className="text-primary">in minutes</span>
              </h1>
              <p className="mt-6 text-lg text-muted-foreground sm:text-xl">
                AI-powered matching. Verified metrics. Payment guaranteed.
              </p>
              <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto"
                  onClick={() => openChat("newsletter")}
                >
                  <Mail data-icon="inline-start" />
                  I&apos;m a Newsletter Owner
                </Button>
                <Button
                  size="lg"
                  className="w-full sm:w-auto"
                  onClick={() => openChat("business")}
                >
                  I&apos;m a Business
                  <ArrowRight data-icon="inline-end" />
                </Button>
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
              <p className="mt-4 text-muted-foreground">
                From sign-up to sponsorship in three simple steps.
              </p>
            </div>
            <div className="mt-16 grid gap-8 sm:grid-cols-3">
              {[
                {
                  icon: MessageSquare,
                  step: "1",
                  title: "Sign up in 5 minutes",
                  description:
                    "Tell our AI about your newsletter or business through a quick chat.",
                },
                {
                  icon: Sparkles,
                  step: "2",
                  title: "Get matched instantly",
                  description:
                    "Our AI finds the perfect sponsors or newsletters based on niche, audience, and budget.",
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
                  <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
                    <item.icon className="size-7 text-primary" />
                  </div>
                  <span className="mb-2 inline-block text-xs font-semibold uppercase tracking-wider text-primary">
                    Step {item.step}
                  </span>
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* For Newsletter Owners Section */}
        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div>
                <Badge variant="outline" className="mb-4">
                  For Newsletter Owners
                </Badge>
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  Turn your audience into revenue
                </h2>
                <p className="mt-4 text-muted-foreground">
                  Join Stroby for free and let AI bring vetted sponsors directly
                  to you. No outreach needed.
                </p>
                <Button
                  className="mt-8"
                  size="lg"
                  variant="outline"
                  onClick={() => openChat("newsletter")}
                >
                  <Mail data-icon="inline-start" />
                  Join as Newsletter Owner
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  {
                    icon: DollarSign,
                    title: "Free to join",
                    description: "No upfront cost to list your newsletter.",
                  },
                  {
                    icon: Sparkles,
                    title: "Passive sponsor income",
                    description: "AI finds sponsors for you automatically.",
                  },
                  {
                    icon: CheckCircle,
                    title: "Vetted sponsors only",
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
                    className="rounded-xl border bg-card p-5 transition-shadow hover:shadow-md"
                  >
                    <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10">
                      <item.icon className="size-5 text-primary" />
                    </div>
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
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
                      "Find relevant newsletters instantly with smart AI.",
                  },
                  {
                    icon: BarChart3,
                    title: "Verified metrics",
                    description:
                      "Real subscriber data you can trust, verified by API.",
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
                    className="rounded-xl border bg-card p-5 transition-shadow hover:shadow-md"
                  >
                    <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10">
                      <item.icon className="size-5 text-primary" />
                    </div>
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>
              <div className="order-1 lg:order-2">
                <Badge variant="outline" className="mb-4">
                  For Businesses
                </Badge>
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  Reach your ideal audience, guaranteed
                </h2>
                <p className="mt-4 text-muted-foreground">
                  Skip the guesswork. Stroby matches you with verified
                  newsletters that fit your niche, audience, and budget.
                </p>
                <Button
                  className="mt-8"
                  size="lg"
                  onClick={() => openChat("business")}
                >
                  Find Newsletters
                  <ArrowRight data-icon="inline-end" />
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Trust Signals Bar */}
        <section className="border-y bg-primary/5 py-12">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid gap-8 sm:grid-cols-3">
              {[
                {
                  icon: Lock,
                  label: "Payments held in escrow",
                },
                {
                  icon: BarChart3,
                  label: "Verified newsletter metrics",
                },
                {
                  icon: Shield,
                  label: "Placement guarantee",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-center gap-3"
                >
                  <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
                    <item.icon className="size-5 text-primary" />
                  </div>
                  <span className="font-medium">{item.label}</span>
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
              <p className="mt-4 text-muted-foreground">
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
                      newsletters based on niche, audience demographics, and
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
                      Stroby is completely free for newsletter owners. For
                      businesses, we charge a 15% commission on each transaction.
                      There are no upfront fees, subscriptions, or hidden costs.
                    </p>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem>
                  <AccordionTrigger>
                    How do you verify newsletter metrics?
                  </AccordionTrigger>
                  <AccordionContent>
                    <p>
                      We use direct API integrations with major email service
                      providers (like Beehiiv, ConvertKit, and Mailchimp) to pull
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
                      If a newsletter&apos;s actual performance metrics fall
                      significantly short of what was promised (e.g., open rates,
                      subscriber count), Stroby will issue a partial or full
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
                      When a sponsorship is booked, the business pays into
                      Stroby&apos;s escrow. The funds are held securely while the
                      placement runs. Once the newsletter submits proof of
                      placement and metrics are verified, the funds are released
                      to the newsletter owner.
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
                      Stroby currently supports B2B, SaaS, Marketing, Fintech,
                      AI/ML, Developer Tools, and more. We&apos;re continuously
                      expanding our marketplace. If your niche isn&apos;t listed,
                      sign up anyway and our AI will work to find you the best
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
                      Yes! Agencies are welcome on Stroby. You can onboard each
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
              Ready to get started?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Join the marketplace that makes newsletter sponsorships simple,
              transparent, and risk-free.
            </p>
            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button
                variant="outline"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => openChat("newsletter")}
              >
                <Mail data-icon="inline-start" />
                I&apos;m a Newsletter Owner
              </Button>
              <Button
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => openChat("business")}
              >
                I&apos;m a Business
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded-md bg-primary">
                <Zap className="size-3 text-primary-foreground" />
              </div>
              <span className="text-sm font-semibold">Stroby.ai</span>
            </div>
            <nav className="flex gap-6 text-sm text-muted-foreground">
              <a href="#" className="transition-colors hover:text-foreground">
                Privacy
              </a>
              <a href="#" className="transition-colors hover:text-foreground">
                Terms
              </a>
              <a href="#" className="transition-colors hover:text-foreground">
                Contact
              </a>
            </nav>
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} Stroby. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      {/* Chat Widget */}
      <ChatWidget
        isOpen={chatOpen}
        onOpenChange={setChatOpen}
        userType={userType}
      />
    </>
  );
}
