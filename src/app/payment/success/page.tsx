import { Zap, CheckCircle } from "lucide-react";

export default function PaymentSuccessPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
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
          Payment received!
        </h1>
        <p className="mt-4 text-muted-foreground">
          Your funds are held securely in escrow. The newsletter owner has been
          notified. You&apos;ll receive updates on WhatsApp.
        </p>
      </div>
    </div>
  );
}
