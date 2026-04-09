import { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase";
import { Zap } from "lucide-react";
import WelcomeContent from "@/components/welcome-content";
import { MarketingHeader } from "@/components/marketing-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Welcome to Stroby",
  description:
    "Your profile is live. See what happens next and start getting matched with sponsors or newsletters.",
};

async function fetchProfile(id: string, type?: string) {
  const supabase = createServiceClient();

  if (type === "newsletter") {
    const { data } = await supabase
      .from("newsletter_profiles")
      .select("*")
      .eq("id", id)
      .single();
    if (data) return { profile: data, userType: "newsletter" as const };
  }

  if (type === "business") {
    const { data } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("id", id)
      .single();
    if (data) return { profile: data, userType: "business" as const };
  }

  // If no type specified, try newsletter first, then business
  if (!type) {
    const { data: newsletter } = await supabase
      .from("newsletter_profiles")
      .select("*")
      .eq("id", id)
      .single();
    if (newsletter)
      return { profile: newsletter, userType: "newsletter" as const };

    const { data: business } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("id", id)
      .single();
    if (business)
      return { profile: business, userType: "business" as const };
  }

  return null;
}

async function fetchNicheCounts(niche?: string) {
  const supabase = createServiceClient();

  const { count: totalNewsletters } = await supabase
    .from("newsletter_profiles")
    .select("*", { count: "exact", head: true });

  const { count: totalBusinesses } = await supabase
    .from("business_profiles")
    .select("*", { count: "exact", head: true });

  let nicheNewsletters = 0;
  let nicheBusinesses = 0;

  if (niche) {
    const { count: nn } = await supabase
      .from("newsletter_profiles")
      .select("*", { count: "exact", head: true })
      .contains("niches", [niche]);
    nicheNewsletters = nn ?? 0;

    const { count: nb } = await supabase
      .from("business_profiles")
      .select("*", { count: "exact", head: true })
      .eq("primary_niche", niche);
    nicheBusinesses = nb ?? 0;
  }

  return {
    businesses: niche ? nicheBusinesses : (totalBusinesses ?? 0),
    newsletters: totalNewsletters ?? 0,
  };
}

export default async function WelcomePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const { type } = await searchParams;
  const typeStr = typeof type === "string" ? type : undefined;

  const result = await fetchProfile(id, typeStr);

  if (!result) {
    return (
      <>
        <MarketingHeader right={null} />
        <main className="flex flex-1 items-center justify-center px-4 py-20">
          <div className="mx-auto max-w-lg text-center">
            <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-primary/10">
              <Zap className="size-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              Welcome to Stroby!
            </h1>
            <p className="mt-4 text-muted-foreground">
              Thanks for signing up. We&apos;re setting things up for you.
              You&apos;ll hear from us via WhatsApp within 48 hours with your
              first match.
            </p>
            <Link
              href="/"
              className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              Back to home
            </Link>
          </div>
        </main>
        <SiteFooter />
      </>
    );
  }

  const { profile, userType } = result;

  const niche =
    userType === "newsletter"
      ? profile.niches?.[0]
      : profile.primary_niche;

  const nicheCounts = await fetchNicheCounts(niche);

  return (
    <>
      <MarketingHeader right={null} />
      <main className="flex-1">
        <WelcomeContent
          profile={profile}
          userType={userType}
          profileId={id}
          nicheCounts={nicheCounts}
        />
      </main>
      <SiteFooter />
    </>
  );
}
