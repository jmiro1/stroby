import { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase";
import { verifyClaimToken } from "@/lib/shadow/tokens";
import { Zap } from "lucide-react";
import { MarketingHeader } from "@/components/marketing-header";
import { SiteFooter } from "@/components/site-footer";
import ClaimForm from "./claim-form";

export const metadata: Metadata = {
  title: "Claim your Stroby profile",
  description: "Your pre-built Stroby profile is waiting — activate it to see your matches.",
  robots: { index: false, follow: false },
};

async function fetchShadow(profileId: string, profileType: "brand" | "creator") {
  const supabase = createServiceClient();
  const table = profileType === "brand" ? "business_profiles_all" : "newsletter_profiles_all";
  const { data } = await supabase
    .from(table)
    .select("*")
    .eq("id", profileId)
    .maybeSingle();
  return data;
}

function NotFound({ reason }: { reason: string }) {
  return (
    <>
      <MarketingHeader right={null} />
      <main className="flex flex-1 items-center justify-center px-4 py-20">
        <div className="mx-auto max-w-lg text-center">
          <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-primary/10">
            <Zap className="size-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Link expired or invalid</h1>
          <p className="mt-4 text-muted-foreground">
            {reason === "expired"
              ? "This claim link has expired. Reply to the email we sent and we'll send you a fresh one."
              : reason === "already_claimed"
                ? "This profile is already active on Stroby. Message us on WhatsApp to see your matches."
                : "We couldn't verify this link. Reply to the email we sent and we'll send you a fresh one."}
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

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const verified = verifyClaimToken(token);
  if (!verified.ok || !verified.payload) {
    return <NotFound reason={verified.error || "invalid"} />;
  }

  const { profile_id, profile_type } = verified.payload;
  const profile = await fetchShadow(profile_id, profile_type);
  if (!profile) return <NotFound reason="not_found" />;
  if (profile.onboarding_status !== "shadow") {
    return <NotFound reason="already_claimed" />;
  }

  return (
    <>
      <MarketingHeader right={null} />
      <main className="flex-1 px-4 py-12">
        <div className="mx-auto max-w-2xl">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
              <Zap className="size-7 text-primary" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Claim your Stroby profile</h1>
            <p className="mt-3 text-muted-foreground">
              {profile_type === "brand"
                ? "We've pre-built your profile with matching newsletter creators. Confirm a few details to activate."
                : "We've pre-built your profile with matching brand partners. Confirm a few details to activate."}
            </p>
          </div>
          <ClaimForm
            token={token}
            profileType={profile_type}
            initial={{
              name:
                (profile.company_name as string | undefined) ||
                (profile.newsletter_name as string | undefined) ||
                "",
              contact_name:
                (profile.contact_name as string | undefined) ||
                (profile.owner_name as string | undefined) ||
                "",
              email: (profile.email as string | undefined) || "",
              niche: (profile.primary_niche as string | undefined) || "",
            }}
          />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
