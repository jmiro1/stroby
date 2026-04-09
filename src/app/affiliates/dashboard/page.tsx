/**
 * /affiliates/dashboard — main dashboard view.
 *
 * Server component. The auth check is in the parent layout.tsx, so by
 * the time we're here we know there's a valid affiliate session.
 */
import { cookies } from "next/headers";
import Link from "next/link";
import { getAffiliateFromSessionToken } from "@/lib/affiliates/auth";
import {
  getCommissionTotals,
  listReferralsByAffiliate,
  listCommissionsByAffiliate,
} from "@/lib/affiliates/queries";
import { AFFILIATE_CONFIG } from "@/lib/affiliates/config";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  CheckCircle,
  Clock,
  DollarSign,
  Users,
  Wallet,
} from "lucide-react";

function formatUsd(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function referralLabel(r: { status: string; pending_email: string | null; pending_name: string | null; newsletter_profile_id: string | null; business_profile_id: string | null; other_profile_id: string | null; attribution_method: string }): string {
  if (r.status === "pending" && r.pending_name) {
    return `${r.pending_name} (${r.pending_email ?? ""})`;
  }
  if (r.newsletter_profile_id) return `Newsletter (${r.attribution_method})`;
  if (r.business_profile_id) return `Business (${r.attribution_method})`;
  if (r.other_profile_id) return `Creator (${r.attribution_method})`;
  return "Pending";
}

export default async function DashboardOverviewPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AFFILIATE_CONFIG.SESSION_COOKIE_NAME)?.value;
  const affiliate = await getAffiliateFromSessionToken(sessionToken);
  // The layout already redirects on null, but TS doesn't know that
  if (!affiliate) return null;

  const [totals, recentReferrals, recentCommissions] = await Promise.all([
    getCommissionTotals(affiliate.id),
    listReferralsByAffiliate(affiliate.id, { limit: 10 }),
    listCommissionsByAffiliate(affiliate.id, { limit: 10 }),
  ]);

  const referralLink = `${AFFILIATE_CONFIG.PUBLIC_BASE_URL}/r/${affiliate.referral_code}`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Welcome back, {affiliate.full_name.split(/\s+/)[0]}
        </h1>
        <p className="mt-1 text-muted-foreground">
          Your tier:{" "}
          <span className="font-medium capitalize text-foreground">
            {affiliate.tier}
          </span>{" "}
          · Status:{" "}
          <span className="font-medium capitalize text-foreground">
            {affiliate.status}
          </span>
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Clock className="size-5" />}
          label="Pending"
          value={formatUsd(totals.pending_cents)}
          subtitle={`${totals.pending_count} commission${totals.pending_count === 1 ? "" : "s"}`}
        />
        <StatCard
          icon={<Wallet className="size-5" />}
          label="Payable"
          value={formatUsd(totals.payable_cents)}
          subtitle={`${totals.payable_count} commission${totals.payable_count === 1 ? "" : "s"}`}
        />
        <StatCard
          icon={<CheckCircle className="size-5" />}
          label="Lifetime paid"
          value={formatUsd(affiliate.lifetime_paid_cents)}
          subtitle={`${totals.paid_count} payouts`}
        />
        <StatCard
          icon={<Users className="size-5" />}
          label="Referrals"
          value={String(affiliate.lifetime_referrals)}
          subtitle={`${affiliate.lifetime_deals} closed deals`}
        />
      </div>

      {/* Referral link */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Your referral link</CardTitle>
          <CardDescription>
            Share this anywhere. Anyone who signs up after clicking it gets
            attributed to you for 30 days.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 font-mono text-sm">
            <code className="flex-1 truncate">{referralLink}</code>
          </div>
          <p className="text-xs text-muted-foreground">
            Or hand someone your code: <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{affiliate.referral_code}</code>
          </p>
          <Link href="/affiliates/dashboard/intros/new">
            <Button>
              Make a manual intro
              <ArrowRight data-icon="inline-end" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Recent referrals */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Recent referrals</CardTitle>
          <CardDescription>
            Most recent {recentReferrals.length} of {affiliate.lifetime_referrals} total
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentReferrals.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No referrals yet. Share your link or make a manual intro.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Who</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentReferrals.map((r) => (
                    <tr key={r.id} className="border-t border-foreground/5">
                      <td className="px-3 py-2">{referralLabel(r)}</td>
                      <td className="px-3 py-2">
                        <span className="capitalize text-muted-foreground">
                          {r.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatDate(r.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent commissions */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Recent commissions</CardTitle>
          <CardDescription>
            Lifetime earned: {formatUsd(affiliate.lifetime_earned_cents)}
            {totals.clawback_pending_cents !== 0 && (
              <>
                {" "}· Clawbacks pending: {formatUsd(totals.clawback_pending_cents)}
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentCommissions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No commissions yet. They&apos;ll appear here when one of your
              introduced parties closes a deal.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Side</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Earned</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCommissions.map((c) => (
                    <tr key={c.id} className="border-t border-foreground/5">
                      <td className="px-3 py-2 font-medium">
                        {formatUsd(c.commission_cents)}
                      </td>
                      <td className="px-3 py-2 capitalize text-muted-foreground">
                        {c.attributed_side}
                      </td>
                      <td className="px-3 py-2">
                        <span className="capitalize text-muted-foreground">
                          {c.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatDate(c.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function StatCard({
  icon,
  label,
  value,
  subtitle,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle: string;
}) {
  return (
    <Card size="sm">
      <CardContent className="pt-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 font-heading text-2xl font-semibold">{value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <div className="text-muted-foreground">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}
