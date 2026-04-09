import type { Metadata } from "next";
import { MarketingHeader } from "@/components/marketing-header";
import { SiteFooter } from "@/components/site-footer";
import { WhatsAppCTA } from "@/components/whatsapp-cta";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with Stroby. Send us a message or ping us on WhatsApp — we usually reply within a few hours.",
};

export default function ContactPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-background">
      <MarketingHeader right={null} />

      {/* Form */}
      <section className="mx-auto w-full max-w-xl px-4 py-12 sm:py-16">
        <h1 className="font-heading text-4xl font-semibold tracking-tight">
          Get in touch
        </h1>
        <p className="mt-3 text-muted-foreground">
          Drop us a message and we&apos;ll get back to you. For anything urgent
          or fast-moving, the WhatsApp option below is the quickest path.
        </p>

        <div className="mt-10">
          <ContactForm />
        </div>
      </section>

      {/* WhatsApp CTA — same one as the homepage bottom */}
      <WhatsAppCTA headline="Or message Stroby directly on WhatsApp" />

      <SiteFooter />
    </main>
  );
}
