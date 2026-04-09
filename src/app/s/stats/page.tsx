import { createServiceClient } from "@/lib/supabase";
import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ActivityFeed } from "@/components/activity-feed";
import { MarketingHeader } from "@/components/marketing-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Stroby Network Stats",
  description:
    "See how Stroby's native brand distribution network is growing.",
  openGraph: {
    title: "Stroby Network Stats",
    description:
      "See how Stroby's native brand distribution network is growing.",
    images: ["/og-image.png"],
  },
};

export const revalidate = 60; // revalidate every 60 seconds

async function getStats() {
  const supabase = createServiceClient();

  const [
    { count: newsletterCount },
    { count: otherCount },
    { count: brandCount },
    { count: totalIntros },
    { count: completedIntros },
    { data: nicheData },
  ] = await Promise.all([
    supabase
      .from("newsletter_profiles")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("other_profiles")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("business_profiles")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("introductions")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("introductions")
      .select("*", { count: "exact", head: true })
      .in("status", ["introduced", "completed"]),
    supabase
      .from("business_profiles")
      .select("primary_niche")
      .eq("is_active", true)
      .not("primary_niche", "is", null),
  ]);

  // Count niches
  const nicheCounts: Record<string, number> = {};
  if (nicheData) {
    for (const row of nicheData) {
      const niche = row.primary_niche;
      if (niche) {
        nicheCounts[niche] = (nicheCounts[niche] || 0) + 1;
      }
    }
  }

  return {
    creators: (newsletterCount || 0) + (otherCount || 0),
    brands: brandCount || 0,
    matches: totalIntros || 0,
    completed: completedIntros || 0,
    niches: nicheCounts,
  };
}

const NICHE_COLORS = [
  "from-violet-500/20 to-purple-500/20 text-violet-700 dark:text-violet-300 border-violet-500/30",
  "from-blue-500/20 to-cyan-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30",
  "from-emerald-500/20 to-teal-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  "from-amber-500/20 to-orange-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30",
  "from-rose-500/20 to-pink-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30",
  "from-indigo-500/20 to-blue-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-500/30",
  "from-teal-500/20 to-green-500/20 text-teal-700 dark:text-teal-300 border-teal-500/30",
  "from-fuchsia-500/20 to-purple-500/20 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30",
];

export default async function StatsPage() {
  const stats = await getStats();

  const sortedNiches = Object.entries(stats.niches).sort(
    (a, b) => b[1] - a[1]
  );

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-gradient-to-b from-background via-background to-primary/5">
      {/* Decorative background elements */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -right-40 top-1/3 h-96 w-96 rounded-full bg-violet-500/5 blur-3xl" />
        <div className="absolute -left-20 bottom-1/4 h-72 w-72 rounded-full bg-blue-500/5 blur-3xl" />
      </div>

      <MarketingHeader right={null} />

      <main className="relative mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {/* Header */}
        <div className="flex flex-col items-center text-center">
          <Link href="/" className="relative mb-6 transition-transform hover:scale-105">
            <div className="absolute inset-0 scale-150 rounded-full bg-primary/10 blur-2xl" />
            <Image
              src="/logo-emoji.png"
              alt="Stroby"
              width={120}
              height={120}
              className="relative drop-shadow-xl"
              priority
            />
          </Link>
          <h1 className="mb-2 text-4xl font-extrabold tracking-tight sm:text-5xl">
            Stroby Network
          </h1>
          <p className="max-w-md text-lg text-muted-foreground">
            Real-time look at how the native brand distribution network is
            growing.
          </p>
        </div>

        {/* Stat Cards */}
        <div className="mt-14 grid gap-4 sm:grid-cols-2">
          <StatCard
            label="Creators"
            value={stats.creators}
            description="Active newsletter & content creators"
            gradient="from-blue-500 to-cyan-400"
          />
          <StatCard
            label="Brands"
            value={stats.brands}
            description="Businesses looking for distribution"
            gradient="from-violet-500 to-purple-400"
          />
          <StatCard
            label="Matches Made"
            value={stats.matches}
            description="Total introductions initiated"
            gradient="from-emerald-500 to-teal-400"
          />
          <StatCard
            label="Completed"
            value={stats.completed}
            description="Introductions successfully delivered"
            gradient="from-amber-500 to-orange-400"
          />
        </div>

        {/* Top Niches */}
        {sortedNiches.length > 0 && (
          <div className="mt-14">
            <h2 className="mb-6 text-center text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Top Niches
            </h2>
            <div className="flex flex-wrap justify-center gap-3">
              {sortedNiches.map(([niche, count], i) => (
                <span
                  key={niche}
                  className={`inline-flex items-center gap-2 rounded-full border bg-gradient-to-r px-4 py-2 text-sm font-medium ${NICHE_COLORS[i % NICHE_COLORS.length]}`}
                >
                  {niche}
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-white/50 px-1.5 text-xs font-bold dark:bg-white/10">
                    {count}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Live Activity Feed */}
        <div className="mt-16">
          <h2 className="mb-4 text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Live Activity
          </h2>
          <p className="mb-6 text-center text-sm text-muted-foreground">
            Real events from the last 7 days, updated in real time.
          </p>
          <div className="mx-auto max-w-xl rounded-2xl border bg-card/30 p-4 sm:p-6">
            <ActivityFeed />
          </div>
        </div>

        {/* CTA */}
        <div className="mt-16 flex flex-col items-center text-center">
          <h2 className="mb-3 text-2xl font-bold tracking-tight sm:text-3xl">
            Join the network
          </h2>
          <p className="mb-6 max-w-sm text-muted-foreground">
            Whether you&apos;re a creator or a brand, Stroby connects you with
            the right partners through WhatsApp.
          </p>
          <a
            href="https://wa.me/message/2QFL7QR7EBZTD1"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-full bg-[#25D366] px-8 py-4 text-lg font-semibold text-white shadow-xl transition-all hover:scale-105 hover:shadow-2xl active:scale-100"
          >
            <svg viewBox="0 0 24 24" className="size-6 fill-current">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Message Stroby on WhatsApp
          </a>
        </div>

        <div className="mt-20 text-center">
          <p className="text-xs text-muted-foreground">
            Updated live &middot;{" "}
            {new Date().toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

function StatCard({
  label,
  value,
  description,
  gradient,
}: {
  label: string;
  value: number;
  description: string;
  gradient: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border bg-card p-6 transition-shadow hover:shadow-lg">
      <div
        className={`absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${gradient} opacity-20 blur-xl transition-transform group-hover:scale-150`}
      />
      <p className="relative text-sm font-medium text-muted-foreground">
        {label}
      </p>
      <p className="relative mt-2 text-5xl font-extrabold tracking-tight">
        {value.toLocaleString()}
      </p>
      <p className="relative mt-1 text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
