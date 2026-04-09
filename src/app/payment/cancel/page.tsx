import { Zap, XCircle } from "lucide-react";
import { MarketingHeader } from "@/components/marketing-header";
import { SiteFooter } from "@/components/site-footer";

export default function PaymentCancelPage() {
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
            <XCircle className="size-16 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Payment cancelled
          </h1>
          <p className="mt-4 text-muted-foreground">
            No charges were made. You can return to WhatsApp to continue the
            conversation with Stroby.
          </p>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
