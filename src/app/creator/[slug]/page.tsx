import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase";
import { MarketingHeader } from "@/components/marketing-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const WA_LINK = "https://wa.me/message/2QFL7QR7EBZTD1";

interface Profile {
  id: string;
  slug?: string;
  newsletter_name?: string;
  name?: string;
  primary_niche?: string;
  niche?: string;
  subscriber_count?: number | null;
  description?: string | null;
  verification_status?: string;
  avatar_url?: string | null;
}

async function fetchCreator(slug: string): Promise<{ profile: Profile; source: "newsletter" | "other" } | null> {
  const supabase = createServiceClient();

  // Try newsletter_profiles first
  const { data: newsletter } = await supabase
    .from("newsletter_profiles")
    .select("id, slug, newsletter_name, primary_niche, subscriber_count, description, verification_status, avatar_url")
    .eq("slug", slug)
    .single();

  if (newsletter) {
    return { profile: newsletter, source: "newsletter" };
  }

  // Fall back to other_profiles
  const { data: other } = await supabase
    .from("other_profiles")
    .select("id, slug, name, niche, description, verification_status, avatar_url")
    .eq("slug", slug)
    .single();

  if (other) {
    return { profile: other, source: "other" };
  }

  return null;
}

function getDisplayName(profile: Profile, source: "newsletter" | "other"): string {
  if (source === "newsletter") return profile.newsletter_name || "Creator";
  return profile.name || "Creator";
}

function getNiche(profile: Profile, source: "newsletter" | "other"): string {
  if (source === "newsletter") return profile.primary_niche || "Creator";
  return profile.niche || "Creator";
}

function getDescription(profile: Profile): string {
  if (!profile.description) return "";
  const desc = profile.description.length > 200
    ? profile.description.slice(0, 200) + "..."
    : profile.description;
  // Strip any "Image context:" prefixes from AI image analysis
  return desc.replace(/\|\s*Image context:.*$/g, "").trim();
}

function getAudienceLabel(profile: Profile, source: "newsletter" | "other"): string {
  const desc = profile.description || "";
  // If description reads like an audience description, use it directly
  // Otherwise, combine niche + generic wording
  const niche = source === "newsletter" ? profile.primary_niche : profile.niche;

  if (desc.length > 20) {
    // Clean up and make it read as "Audience: ..."
    let audience = desc.replace(/\|\s*Image context:.*$/g, "").trim();
    // If it starts with common prefixes, strip them
    audience = audience.replace(/^(my audience is|our audience is|we reach|i reach|targeting|focused on)\s*/i, "");
    // Capitalize first letter
    audience = audience.charAt(0).toUpperCase() + audience.slice(1);
    // Truncate
    if (audience.length > 120) audience = audience.slice(0, 120) + "...";
    return audience;
  }

  if (niche) return `${niche} community`;
  return "";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await fetchCreator(slug);

  if (!result) {
    return { title: "Creator not found | Stroby" };
  }

  const name = getDisplayName(result.profile, result.source);
  const niche = getNiche(result.profile, result.source);
  const descSnippet = result.profile.description
    ? result.profile.description.slice(0, 100)
    : "";

  return {
    title: `${name} on Stroby`,
    description: `${name} — ${niche} creator on Stroby. ${descSnippet}`,
    openGraph: {
      title: `${name} on Stroby`,
      description: `${name} — ${niche} creator on Stroby. ${descSnippet}`,
      images: ["/og-image.png"],
    },
  };
}

export default async function CreatorProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await fetchCreator(slug);

  if (!result) {
    notFound();
  }

  const { profile, source } = result;
  const name = getDisplayName(profile, source);
  const niche = getNiche(profile, source);
  const audience = getAudienceLabel(profile, source);
  const isVerified = profile.verification_status !== "unverified" && !!profile.verification_status;
  const avatarSrc = profile.avatar_url || "/logo-emoji.png";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://stroby.ai";

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <MarketingHeader
        right={
          <Link href="/whatsapp">
            <Button size="default">
              Connect with Creator
              <ArrowRight data-icon="inline-end" />
            </Button>
          </Link>
        }
      />
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        {/* Avatar / Logo — links home */}
        <Link href="/" className="mb-6 transition-transform hover:scale-105">
          <Image
            src={avatarSrc}
            alt={name}
            width={120}
            height={120}
            className="size-[100px] rounded-full object-cover drop-shadow-lg sm:size-[120px]"
            priority
          />
        </Link>

        {/* Creator name */}
        <h1 className="mb-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {name}
        </h1>

        {/* Niche badge */}
        <span className="mb-4 inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
          {niche}
        </span>

        {/* Subscriber count — only if verified */}
        {isVerified && profile.subscriber_count != null && (
          <p className="mb-2 flex items-center gap-2 text-base text-muted-foreground">
            <span className="font-semibold text-foreground">
              {profile.subscriber_count.toLocaleString()}
            </span>
            subscribers
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
              Verified ✅
            </span>
          </p>
        )}

        {/* Audience */}
        {audience && (
          <p className="mb-8 text-base text-muted-foreground">
            <span className="font-medium text-foreground">Audience:</span> {audience}
          </p>
        )}

        {/* CTA button */}
        <a
          href={WA_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full rounded-full bg-primary px-6 py-4 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:scale-105 hover:shadow-xl active:scale-100 sm:w-auto sm:px-8 sm:text-lg"
        >
          Connect with {name}
        </a>

        <p className="mt-10 text-sm text-muted-foreground">
          Powered by Stroby — your AI Superconnector.
        </p>

        <a
          href={`/creator/${profile.slug}/edit`}
          className="mt-3 rounded-lg border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Edit your profile
        </a>

      </div>
      </div>
      <SiteFooter />
    </div>
  );
}
