import type { Metadata } from "next";
import Image from "next/image";
import { MarketingHeader } from "@/components/marketing-header";

const WA_LINK = "https://wa.me/message/2QFL7QR7EBZTD1";
const QR_500 = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(WA_LINK)}&bgcolor=ffffff&color=000000&margin=2`;
const QR_1000 = `https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&data=${encodeURIComponent(WA_LINK)}&bgcolor=ffffff&color=000000&margin=2&format=png`;
const QR_SVG = `https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&data=${encodeURIComponent(WA_LINK)}&bgcolor=ffffff&color=000000&margin=2&format=svg`;

export const metadata: Metadata = {
  title: "Stroby QR Code — Scan to Message on WhatsApp",
  description:
    "Print-friendly QR code that opens a WhatsApp chat with Stroby, your AI Superconnector for brand distribution.",
  robots: { index: false, follow: false },
};

export default function QrPage() {
  return (
    <>
      <div className="print:hidden">
        <MarketingHeader right={null} />
      </div>
      <div className="min-h-dvh bg-background px-4 py-12 print:bg-white print:py-0">
        <div className="mx-auto flex max-w-xl flex-col items-center text-center">
        <a href="/" className="mb-6 print:hidden">
          <Image
            src="/logo-emoji.png"
            alt="Stroby AI"
            width={96}
            height={96}
            priority
          />
        </a>

        <h1 className="mb-2 text-3xl font-bold tracking-tight print:text-4xl">
          Scan to message Stroby
        </h1>
        <p className="mb-8 text-muted-foreground print:text-black">
          Your AI Superconnector for brand distribution. Find the perfect
          newsletters and creators on WhatsApp.
        </p>

        {/* The QR itself — uses qrserver API so it stays in sync with WA_LINK */}
        <div className="rounded-2xl border bg-white p-6 shadow-lg print:border-0 print:shadow-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={QR_500}
            alt="QR code to message Stroby on WhatsApp"
            width={500}
            height={500}
            className="size-[320px] sm:size-[400px] print:size-[500px]"
          />
        </div>

        <p className="mt-6 font-mono text-sm text-muted-foreground print:text-black">
          wa.me/message/2QFL7QR7EBZTD1
        </p>

        <p className="mt-2 text-base font-medium print:text-lg">
          stroby.ai
        </p>

        {/* Download / utility links — hidden when printing */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 print:hidden">
          <a
            href={QR_1000}
            download="stroby-qr.png"
            className="rounded-full border px-5 py-2 text-sm font-medium transition hover:bg-muted"
          >
            Download PNG (1000×1000)
          </a>
          <a
            href={QR_SVG}
            download="stroby-qr.svg"
            className="rounded-full border px-5 py-2 text-sm font-medium transition hover:bg-muted"
          >
            Download SVG
          </a>
          <a
            href={WA_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-[#25D366] px-5 py-2 text-sm font-semibold text-white shadow transition hover:scale-105"
          >
            Test the link
          </a>
        </div>

        <div className="mt-6 flex gap-4 text-xs text-muted-foreground print:hidden">
          <a href="/" className="underline hover:text-foreground">Home</a>
          <a href="/whatsapp" className="underline hover:text-foreground">WhatsApp page</a>
        </div>
        </div>
      </div>
    </>
  );
}
