/**
 * /affiliates — public landing page for the affiliate program.
 * Pure server component, no auth required.
 */
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowRight,
  DollarSign,
  Users,
  Handshake,
  Sparkles,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

export const metadata = {
  title: "Affiliate Program — Earn 10% on every intro",
  description:
    "Join the Stroby affiliate program. Introduce brands or creators and earn 10% commission on every successful deal. Built for media buyers, growth consultants, and newsletter sponsorship operators.",
};

export default function AffiliatesLandingPage() {
  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="text-xl font-semibold tracking-tight">
            Stroby
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/affiliates/login"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Sign in
            </Link>
            <Link href="/affiliates/apply">
              <Button>
                Apply
                <ArrowRight data-icon="inline-end" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-4 py-16 text-center sm:py-24">
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          <Sparkles className="size-3" />
          New: Stroby Affiliate Program
        </div>
        <h1 className="font-heading text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Earn 10% on every intro you make.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          Built for media buyers, growth consultants, and newsletter sponsorship
          operators who already broker deals between brands and creators today.
          Bring them to Stroby. Get paid every time a deal closes.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/affiliates/apply">
            <Button size="lg">
              Apply now
              <ArrowRight data-icon="inline-end" />
            </Button>
          </Link>
          <Link href="#how">
            <Button size="lg" variant="outline">
              How it works
            </Button>
          </Link>
        </div>
      </section>

      {/* The math */}
      <section className="mx-auto max-w-5xl px-4 py-12">
        <div className="rounded-2xl bg-card p-8 ring-1 ring-foreground/10 sm:p-12">
          <div className="text-center">
            <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              The math
            </p>
            <p className="mt-3 font-heading text-3xl font-semibold sm:text-4xl">
              On a $1,000 deal, you earn $100.
            </p>
          </div>
          <div className="mx-auto mt-8 grid max-w-2xl grid-cols-3 gap-4 text-center">
            <div className="rounded-xl bg-background p-4">
              <p className="text-xs text-muted-foreground">Brand pays</p>
              <p className="mt-1 font-heading text-2xl font-semibold">$1,000</p>
            </div>
            <div className="rounded-xl bg-background p-4">
              <p className="text-xs text-muted-foreground">Creator gets</p>
              <p className="mt-1 font-heading text-2xl font-semibold">$800</p>
            </div>
            <div className="rounded-xl bg-primary/10 p-4 ring-1 ring-primary/30">
              <p className="text-xs font-medium text-primary">You earn</p>
              <p className="mt-1 font-heading text-2xl font-semibold text-primary">
                $100
              </p>
            </div>
          </div>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Your 10% comes from Stroby&apos;s platform fee — never from the
            creator&apos;s payout. Brands and creators see no difference.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-5xl px-4 py-16">
        <div className="text-center">
          <h2 className="font-heading text-3xl font-semibold sm:text-4xl">
            Three ways to earn
          </h2>
          <p className="mt-3 text-muted-foreground">
            Choose whichever fits the relationship.
          </p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader>
              <Handshake className="size-6 text-primary" />
              <CardTitle>Manual intros</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Use your dashboard to introduce a specific brand or creator by
                email. When they sign up, you&apos;re automatically credited —
                even if they bounce around on different devices first.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Users className="size-6 text-primary" />
              <CardTitle>Personal referral link</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Share <code className="rounded bg-muted px-1 py-0.5 text-xs">stroby.ai/r/YOURCODE</code>{" "}
                anywhere — DMs, newsletters, social. A 30-day cookie tracks
                everyone who arrives through it.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <DollarSign className="size-6 text-primary" />
              <CardTitle>Referral codes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Tell a brand or creator your code by phone, email, or carrier
                pigeon. They drop it in during signup and you get full credit.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Why us */}
      <section className="mx-auto max-w-5xl px-4 py-16">
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <ShieldCheck className="size-6 text-primary" />
              <CardTitle>12-month attribution window</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                You earn on every deal involving your introduced party for a
                full year from their signup. Repeat business compounds. No cliff
                after the first deal.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <TrendingUp className="size-6 text-primary" />
              <CardTitle>Both sides count</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Most affiliate programs only pay for one side of the
                marketplace. We pay you whether you brought the brand, the
                creator, or — if you brought both — the full commission.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h2 className="font-heading text-3xl font-semibold sm:text-4xl">
          Ready to start?
        </h2>
        <p className="mt-3 text-muted-foreground">
          Approval is hand-curated for the first 100 affiliates. Apply in 60
          seconds, hear back within 24 hours.
        </p>
        <div className="mt-8">
          <Link href="/affiliates/apply">
            <Button size="lg">
              Apply now
              <ArrowRight data-icon="inline-end" />
            </Button>
          </Link>
        </div>
      </section>
    </main>
  );
}
