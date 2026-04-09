/**
 * /affiliates/dashboard/payouts — payout history + Stripe Connect status.
 */
import { cookies } from "next/headers";
import Link from "next/link";
import { getAffiliateFromSessionToken } from "@/lib/affiliates/auth";
import { listPayoutsByAffiliate, getCommissionTotals } from "@/lib/affiliates/queries";
import { AFFILIATE_CONFIG } from "@/lib/affiliates/config";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, CheckCircle, AlertCircle, Wallet } from "lucide-react";
import { ConnectButton } from "./connect-button";

function formatUsd(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function PayoutsPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AFFILIATE_CONFIG.SESSION_COOKIE_NAME)?.value;
  const affiliate = await getAffiliateFromSessionToken(sessionToken);
  if (!affiliate) return null;

  const [payouts, totals] = await Promise.all([
    listPayoutsByAffiliate(affiliate.id),
    getCommissionTotals(affiliate.id),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Link
        href="/affiliates/dashboard"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to dashboard
      </Link>

      <h1 className="font-heading text-3xl font-semibold tracking-tight">
        Payouts
      </h1>
      <p className="mt-1 text-muted-foreground">
        Lifetime paid: {formatUsd(affiliate.lifetime_paid_cents)}
      </p>

      {/* Stripe Connect status */}
      <Card className="mt-8">
        <CardHeader>
          {affiliate.stripe_payouts_enabled ? (
            <CheckCircle className="size-6 text-primary" />
          ) : (
            <AlertCircle className="size-6 text-muted-foreground" />
          )}
          <CardTitle>
            {affiliate.stripe_payouts_enabled
              ? "Stripe Connect: Active"
              : "Stripe Connect: Not yet set up"}
          </CardTitle>
          <CardDescription>
            {affiliate.stripe_payouts_enabled
              ? "Your account is verified and ready to receive payouts."
              : "Connect your Stripe account to start receiving payouts. Stripe handles tax forms and direct deposit."}
          </CardDescription>
        </CardHeader>
        {!affiliate.stripe_payouts_enabled && (
          <CardContent>
            <ConnectButton />
          </CardContent>
        )}
      </Card>

      {/* Pending balance */}
      <Card className="mt-6">
        <CardHeader>
          <Wallet className="size-6 text-muted-foreground" />
          <CardTitle>Current balance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pending (in hold window)</span>
            <span className="font-medium">{formatUsd(totals.pending_cents)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Payable next cycle</span>
            <span className="font-medium">{formatUsd(totals.payable_cents)}</span>
          </div>
          {totals.clawback_pending_cents !== 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Clawbacks pending</span>
              <span className="font-medium text-destructive">
                {formatUsd(totals.clawback_pending_cents)}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t pt-3">
            <span className="font-medium">Net payable</span>
            <span className="font-medium">
              {formatUsd(totals.payable_cents + totals.clawback_pending_cents)}
            </span>
          </div>
          <p className="pt-2 text-xs text-muted-foreground">
            Minimum payout: {formatUsd(AFFILIATE_CONFIG.MIN_PAYOUT_CENTS)}. Payouts run on the 1st of each month.
            Below the minimum the balance rolls forward.
          </p>
        </CardContent>
      </Card>

      {/* Payout history */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Payout history</CardTitle>
          <CardDescription>{payouts.length} total</CardDescription>
        </CardHeader>
        <CardContent>
          {payouts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No payouts yet. Your first one will appear here on the next monthly cycle.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Period</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Commissions</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((p) => (
                    <tr key={p.id} className="border-t border-foreground/5">
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatDate(p.period_start)} → {formatDate(p.period_end)}
                      </td>
                      <td className="px-3 py-2 font-medium">{formatUsd(p.amount_cents)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{p.commission_count}</td>
                      <td className="px-3 py-2">
                        <span className="capitalize text-muted-foreground">{p.status}</span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatDate(p.paid_at ?? p.created_at)}
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

