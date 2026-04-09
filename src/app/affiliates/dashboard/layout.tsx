/**
 * /affiliates/dashboard layout — auth gate.
 *
 * Server component. Reads the session cookie via next/headers, looks up
 * the affiliate, and redirects to /affiliates/login if unauthenticated.
 * Pages within the dashboard tree can assume there's a valid affiliate.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getAffiliateFromSessionToken } from "@/lib/affiliates/auth";
import { AFFILIATE_CONFIG } from "@/lib/affiliates/config";

export const metadata = {
  title: "Affiliate Dashboard",
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AFFILIATE_CONFIG.SESSION_COOKIE_NAME)?.value;
  const affiliate = await getAffiliateFromSessionToken(sessionToken);
  if (!affiliate) {
    redirect("/affiliates/login");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="flex items-center gap-2"
            >
              <div className="relative size-9 overflow-hidden rounded-lg bg-primary">
                <Image
                  src="/logo-emoji.png"
                  alt="Stroby"
                  width={36}
                  height={36}
                  className="size-full object-cover"
                />
              </div>
              <span className="text-xl font-semibold tracking-tight">
                Stroby
              </span>
            </Link>
            <nav className="hidden gap-4 text-sm font-medium text-muted-foreground sm:flex">
              <Link
                href="/affiliates/dashboard"
                className="hover:text-foreground"
              >
                Overview
              </Link>
              <Link
                href="/affiliates/dashboard/intros/new"
                className="hover:text-foreground"
              >
                New intro
              </Link>
              <Link
                href="/affiliates/dashboard/payouts"
                className="hover:text-foreground"
              >
                Payouts
              </Link>
            </nav>
          </div>
          <div className="text-sm text-muted-foreground">
            {affiliate.display_name || affiliate.full_name}
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
