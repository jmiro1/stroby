import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase";
import { NICHES } from "@/lib/constants";
import { MarketingHeader } from "@/components/marketing-header";
import { SiteFooter } from "@/components/site-footer";
import { Users, TrendingUp, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

// Always render fresh from DB — shadow profiles change frequently
export const dynamic = "force-dynamic";

function nicheToSlug(niche: string): string {
  return niche.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function slugToNiche(slug: string): string | null {
  for (const niche of NICHES) {
    if (nicheToSlug(niche) === slug) return niche;
  }
  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ niche: string }>;
}): Promise<Metadata> {
  const { niche: slug } = await params;
  const niche = slugToNiche(slug);
  if (!niche) return { title: "Newsletters" };

  return {
    title: `Best ${niche} Newsletters for Brand Sponsors | Stroby`,
    description: `Discover top ${niche.toLowerCase()} newsletters and creators for sponsorship partnerships. Verified audience metrics, engagement rates, and brand-safe content. Connect via Stroby — free for creators.`,
    openGraph: {
      title: `Best ${niche} Newsletters for Brand Sponsors`,
      description: `Browse verified ${niche.toLowerCase()} newsletters on Stroby. Free matching, double opt-in, Stroby Pay protected.`,
    },
  };
}

async function fetchCreators(niche: string) {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("newsletter_directory")
    .select(
      "id, newsletter_name, owner_name, primary_niche, subscriber_count, audience_reach, engagement_rate, platform, description, url, slug, onboarding_status"
    )
    .eq("primary_niche", niche)
    .eq("is_active", true)
    .order("audience_reach", { ascending: false, nullsFirst: false })
    .limit(50);

  return data || [];
}

async function fetchNicheCounts() {
  const supabase = createServiceClient();
  const counts: Record<string, number> = {};

  for (const niche of NICHES) {
    if (niche === "Other") continue;
    const { count } = await supabase
      .from("newsletter_directory")
      .select("*", { count: "exact", head: true })
      .eq("primary_niche", niche)
      .eq("is_active", true);
    counts[niche] = count || 0;
  }

  return counts;
}

function formatNumber(n: number | null): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default async function NicheDirectoryPage({
  params,
}: {
  params: Promise<{ niche: string }>;
}) {
  const { niche: slug } = await params;
  const niche = slugToNiche(slug);
  if (!niche) notFound();

  const [creators, nicheCounts] = await Promise.all([
    fetchCreators(niche),
    fetchNicheCounts(),
  ]);

  const otherNiches = NICHES.filter(
    (n) => n !== "Other" && n !== niche && (nicheCounts[n] || 0) > 0
  );

  return (
    <>
      <MarketingHeader />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {/* Hero */}
        <div className="mb-12 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Best {niche} Newsletters for Brand Sponsors
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-muted-foreground">
            {creators.length > 0
              ? `${creators.length} verified ${niche.toLowerCase()} creators ready for sponsorship partnerships on Stroby.`
              : `Be one of the first ${niche.toLowerCase()} creators on Stroby — early members get priority matching.`}
          </p>
          <div className="mt-6">
            <Link href="/">
              <Button size="lg">
                Join Stroby — It&rsquo;s Free
                <ArrowRight data-icon="inline-end" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Creator grid */}
        {creators.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {creators.map((creator) => (
              <div
                key={creator.id}
                className="rounded-xl border bg-card p-5 transition-shadow hover:shadow-md"
              >
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold leading-tight">
                      {creator.slug ? (
                        <Link
                          href={`/creator/${creator.slug}`}
                          className="hover:text-primary"
                        >
                          {creator.newsletter_name}
                        </Link>
                      ) : (
                        creator.newsletter_name
                      )}
                    </h3>
                    {creator.owner_name && creator.owner_name !== "Creator" && (
                      <p className="text-sm text-muted-foreground">
                        by {creator.owner_name}
                      </p>
                    )}
                  </div>
                  {creator.platform && creator.platform !== "other" && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {creator.platform}
                    </span>
                  )}
                </div>

                {creator.description && (
                  <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
                    {creator.description}
                  </p>
                )}

                <div className="flex items-center gap-4 text-sm">
                  {creator.onboarding_status !== "shadow" && (creator.audience_reach || creator.subscriber_count) ? (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Users className="size-3.5" />
                      <span>
                        {formatNumber(
                          creator.audience_reach || creator.subscriber_count
                        )}
                      </span>
                    </div>
                  ) : null}
                  {creator.onboarding_status !== "shadow" && creator.engagement_rate ? (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <TrendingUp className="size-3.5" />
                      <span>
                        {(Number(creator.engagement_rate) * 100).toFixed(1)}%
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border bg-card p-12 text-center">
            <p className="text-lg font-medium">
              No {niche.toLowerCase()} creators listed yet
            </p>
            <p className="mt-2 text-muted-foreground">
              Be the first — join Stroby and get priority matching in this
              niche.
            </p>
            <div className="mt-6">
              <Link href="/">
                <Button>Join Now</Button>
              </Link>
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="mt-12 rounded-2xl bg-primary/5 p-8 text-center ring-1 ring-primary/10">
          <h2 className="text-2xl font-bold">
            Looking to sponsor {niche.toLowerCase()} newsletters?
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-muted-foreground">
            Stroby matches brands with the right creators based on audience
            alignment — not just keywords. Free for creators. Double opt-in.
            Stroby Pay protected.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/">
              <Button size="lg">Get Matched</Button>
            </Link>
            <a
              href="https://wa.me/message/2QFL7QR7EBZTD1"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="lg" variant="outline">
                Message on WhatsApp
              </Button>
            </a>
          </div>
        </div>

        {/* Browse other niches */}
        {otherNiches.length > 0 && (
          <div className="mt-16">
            <h2 className="mb-4 text-xl font-semibold">Browse other niches</h2>
            <div className="flex flex-wrap gap-2">
              {otherNiches.map((n) => (
                <Link
                  key={n}
                  href={`/newsletters/${nicheToSlug(n)}`}
                  className="rounded-full border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                >
                  {n}{" "}
                  <span className="text-xs opacity-60">
                    ({nicheCounts[n]})
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
