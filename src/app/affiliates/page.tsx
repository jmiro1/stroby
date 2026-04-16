/**
 * /affiliates — public landing page for the affiliate program.
 * Pure server component, no auth required.
 */
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MarketingHeader } from "@/components/marketing-header";
import { SiteFooter } from "@/components/site-footer";
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
  title: "Affiliate Program — Earn up to 50% of Stroby fees",
  description:
    "Join the Stroby affiliate program. Introduce brands or creators and earn up to 50% of Stroby's platform fees on every successful deal. Limited launch offer. Built for media buyers, growth consultants, and newsletter sponsorship operators.",
};

export default function AffiliatesLandingPage() {
  return (
    <main className="min-h-screen bg-background">
      <MarketingHeader
        right={
          <>
            <Link
              href="/affiliates/login"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Sign in
            </Link>
            <Link href="/affiliates/apply">
              <Button size="default">
                Apply
                <ArrowRight data-icon="inline-end" />
              </Button>
            </Link>
          </>
        }
      />

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-4 py-16 text-center sm:py-24">
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          <Sparkles className="size-3" />
          Launch Campaign — Limited Time
        </div>
        <h1 className="font-heading text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Earn up to 50% of Stroby fees on every deal.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          Built for media buyers, growth consultants, and newsletter sponsorship
          operators who already broker deals between brands and creators today.
          Bring them to Stroby. Get paid every time a deal closes.
        </p>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground/70 italic">
          * Launch campaign rates. Subject to change — but if you join now, your rate is locked for at least 12 months.
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
              On a $1,000 deal, you earn up to $100.*
            </p>
          </div>
          <div className="mx-auto mt-8 grid max-w-2xl gap-4 text-center md:grid-cols-2">
            <div className="rounded-xl bg-background p-4 ring-1 ring-foreground/5">
              <p className="text-xs text-muted-foreground">You referred one side</p>
              <p className="mt-1 font-heading text-2xl font-semibold text-primary">25% of Stroby fee</p>
              <p className="mt-1 text-xs text-muted-foreground">~$50 on a $1,000 deal</p>
            </div>
            <div className="rounded-xl bg-primary/10 p-4 ring-1 ring-primary/30">
              <p className="text-xs font-medium text-primary">You referred both sides</p>
              <p className="mt-1 font-heading text-2xl font-semibold text-primary">50% of Stroby fee</p>
              <p className="mt-1 text-xs text-muted-foreground">~$100 on a $1,000 deal</p>
            </div>
          </div>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Your commission comes from Stroby&apos;s platform fee — never from the
            creator&apos;s payout. Brands and creators see no difference.
          </p>
          <p className="mt-2 text-center text-xs text-muted-foreground/60 italic">
            * Launch campaign rates. Subject to change at any time, but affiliates who join during the launch period lock in these rates for at least 12 months from signup.
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
                marketplace. We pay 25% of fees per side you referred. Brought
                both the brand and the creator? That&apos;s the full 50%.
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

      <SiteFooter />
    </main>
  );
}
