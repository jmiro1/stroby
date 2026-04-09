import { Zap, CheckCircle } from "lucide-react";
import { createServiceClient } from "@/lib/supabase";
import { MarketingHeader } from "@/components/marketing-header";
import { SiteFooter } from "@/components/site-footer";

export default async function StripeConnectCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await searchParams;

  if (id && typeof id === "string") {
    const supabase = createServiceClient();
    await supabase
      .from("newsletter_profiles")
      .update({ onboarding_status: "stripe_connected" })
      .eq("id", id);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <MarketingHeader right={null} />
      <div className="flex flex-1 flex-col items-center justify-center px-4">
        <div className="mx-auto max-w-md text-center">
          <div className="mb-6 flex justify-center">
            <div className="flex size-12 items-center justify-center rounded-xl bg-primary">
              <Zap className="size-6 text-primary-foreground" />
            </div>
          </div>
          <div className="mb-4 flex justify-center">
            <CheckCircle className="size-16 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Stripe connected!
          </h1>
          <p className="mt-4 text-muted-foreground">
            You can close this page. Stroby will message you on WhatsApp when
            sponsors match.
          </p>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
