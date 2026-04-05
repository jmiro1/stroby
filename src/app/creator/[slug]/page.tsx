import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase";

const WA_LINK = "https://wa.me/message/2QFL7QR7EBZTD1";

interface Profile {
  id: string;
  newsletter_name?: string;
  name?: string;
  primary_niche?: string;
  niche?: string;
  subscriber_count?: number | null;
  description?: string | null;
  verification_status?: string;
}

async function fetchCreator(slug: string): Promise<{ profile: Profile; source: "newsletter" | "other" } | null> {
  const supabase = createServiceClient();

  // Try newsletter_profiles first
  const { data: newsletter } = await supabase
    .from("newsletter_profiles")
    .select("id, newsletter_name, primary_niche, subscriber_count, description, verification_status")
    .eq("slug", slug)
    .single();

  if (newsletter) {
    return { profile: newsletter, source: "newsletter" };
  }

  // Fall back to other_profiles
  const { data: other } = await supabase
    .from("other_profiles")
    .select("id, name, niche, subscriber_count, description, verification_status")
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
  return profile.description.length > 200
    ? profile.description.slice(0, 200) + "..."
    : profile.description;
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
  const description = getDescription(profile);
  const isVerified = profile.verification_status !== "unverified" && !!profile.verification_status;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4">
      <div className="flex max-w-md flex-col items-center text-center">
        {/* Stroby character */}
        <Image
          src="/logo-emoji.png"
          alt="Stroby AI"
          width={120}
          height={120}
          className="mb-6 drop-shadow-lg"
          priority
        />

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
          <p className="mb-4 flex items-center gap-2 text-base text-muted-foreground">
            <span className="font-semibold text-foreground">
              {profile.subscriber_count.toLocaleString()}
            </span>
            subscribers
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
              Verified ✅
            </span>
          </p>
        )}

        {/* Description */}
        {description && (
          <p className="mb-8 text-lg text-muted-foreground">{description}</p>
        )}

        {/* CTA button */}
        <a
          href={WA_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:scale-105 hover:shadow-xl active:scale-100"
        >
          Work with {name} through Stroby
        </a>

        <p className="mt-10 text-sm text-muted-foreground">
          Powered by Stroby — your AI Superconnector.
        </p>

        {/* Footer links */}
        <div className="mt-6 flex gap-4 text-xs text-muted-foreground">
          <Link href="/" className="underline hover:text-foreground">
            Home
          </Link>
          <Link href="/about" className="underline hover:text-foreground">
            About
          </Link>
          <Link href="/terms" className="underline hover:text-foreground">
            Terms
          </Link>
          <Link href="/privacy" className="underline hover:text-foreground">
            Privacy
          </Link>
        </div>
      </div>
    </div>
  );
}
