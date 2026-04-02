"use client";

import Image from "next/image";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

export default function DataDeletionPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    }>
      <DeletionContent />
    </Suspense>
  );
}

function DeletionContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4">
      <div className="flex max-w-md flex-col items-center text-center">
        <Image
          src="/logo-emoji.png"
          alt="Stroby AI"
          width={100}
          height={100}
          className="mb-6 drop-shadow-lg"
          priority
        />

        <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="size-7 text-green-600" />
        </div>

        <h1 className="mb-3 text-2xl font-bold sm:text-3xl">
          Data Deletion Request Received
        </h1>

        <p className="mb-4 text-lg text-muted-foreground">
          Your request to delete your data from Stroby has been received and is being processed.
        </p>

        {code && (
          <p className="mb-4 rounded-lg bg-muted px-4 py-3 text-sm">
            Confirmation code: <strong className="font-mono">{code}</strong>
          </p>
        )}

        <div className="mt-2 space-y-2 text-sm text-muted-foreground">
          <p>Your personal data will be deleted within <strong>30 days</strong>.</p>
          <p>This includes your profile, message history, and match data.</p>
          <p>
            If you have questions, contact us at{" "}
            <a href="mailto:privacy@stroby.ai" className="text-primary underline">
              privacy@stroby.ai
            </a>
          </p>
        </div>

        <div className="mt-10 flex gap-4 text-xs text-muted-foreground">
          <a href="/" className="underline hover:text-foreground">Home</a>
          <a href="/privacy" className="underline hover:text-foreground">Privacy Policy</a>
        </div>
      </div>
    </div>
  );
}
