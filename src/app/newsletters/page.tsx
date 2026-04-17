import { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase";
import { NICHES } from "@/lib/constants";
import { MarketingHeader } from "@/components/marketing-header";
import { SiteFooter } from "@/components/site-footer";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Newsletter Directory — Find Creators for Sponsorships | Stroby",
  description:
    "Browse newsletters and creators by niche for sponsorship partnerships. SaaS, fintech, health, AI, e-commerce, and 20+ categories. Free matching on Stroby.",
};

function nicheToSlug(niche: string): string {
  return niche
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function fetchAllNicheCounts() {
  const supabase = createServiceClient();
  const counts: { niche: string; count: number; slug: string }[] = [];

  for (const niche of NICHES) {
    if (niche === "Other") continue;
    const { count } = await supabase
      .from("newsletter_directory")
      .select("*", { count: "exact", head: true })
      .eq("primary_niche", niche)
      .eq("is_active", true);
    counts.push({ niche, count: count || 0, slug: nicheToSlug(niche) });
  }

  return counts.sort((a, b) => b.count - a.count);
}

export default async function NewsletterDirectoryPage() {
  const nicheCounts = await fetchAllNicheCounts();
  const totalCreators = nicheCounts.reduce((sum, n) => sum + n.count, 0);

  return (
    <>
      <MarketingHeader />
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="mb-12 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Newsletter &amp; Creator Directory
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-muted-foreground">
            {totalCreators > 0
              ? `${totalCreators} creators across ${nicheCounts.filter((n) => n.count > 0).length} niches, ready for sponsorship partnerships.`
              : "Browse creators by niche for sponsorship partnerships."}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {nicheCounts.map(({ niche, count, slug }) => (
            <Link
              key={niche}
              href={`/newsletters/${slug}`}
              className="group flex items-center justify-between rounded-xl border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-sm"
            >
              <div>
                <p className="font-medium group-hover:text-primary">{niche}</p>
                <p className="text-sm text-muted-foreground">
                  {count > 0
                    ? `${count} creator${count === 1 ? "" : "s"}`
                    : "Be the first"}
                </p>
              </div>
              <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
            </Link>
          ))}
        </div>

        <div className="mt-12 rounded-2xl bg-primary/5 p-8 text-center ring-1 ring-primary/10">
          <h2 className="text-2xl font-bold">
            Are you a brand looking for newsletter sponsors?
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-muted-foreground">
            Stroby matches you with the right creators based on audience
            alignment. Free WhatsApp chat. Double opt-in. Stroby Pay protected.
          </p>
          <div className="mt-6">
            <Link href="/">
              <Button size="lg">
                Get Matched
                <ArrowRight data-icon="inline-end" />
              </Button>
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
