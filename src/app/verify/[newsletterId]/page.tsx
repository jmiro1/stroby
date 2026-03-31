import { createServiceClient } from "@/lib/supabase";
import { VerifyForm } from "@/components/verify-form";

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ newsletterId: string }>;
}) {
  const { newsletterId } = await params;

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("newsletter_profiles")
    .select("newsletter_name")
    .eq("id", newsletterId)
    .single();

  const newsletterName = profile?.newsletter_name ?? "Your Newsletter";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <VerifyForm
        newsletterId={newsletterId}
        newsletterName={newsletterName}
      />
    </div>
  );
}
