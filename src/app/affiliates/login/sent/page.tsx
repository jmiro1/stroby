/**
 * /affiliates/login/sent — confirmation that a magic link was sent.
 * Pure server component, static.
 */
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";

export const metadata = {
  title: "Check WhatsApp",
  robots: { index: false, follow: false },
};

export default function SentPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-4 py-16">
        <Card>
          <CardHeader>
            <MessageSquare className="size-6 text-primary" />
            <CardTitle>Check your WhatsApp</CardTitle>
            <CardDescription>
              If your phone is registered as an affiliate, you&apos;ll receive
              a sign-in link via WhatsApp shortly.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>The link expires in 15 minutes and can only be used once.</p>
            <p className="mt-3">
              Didn&apos;t receive it?{" "}
              <Link href="/affiliates/login" className="text-primary hover:underline">
                Try again
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
