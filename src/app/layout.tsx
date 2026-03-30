import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stroby - AI-Powered Newsletter Sponsorship Marketplace",
  description:
    "Find and book verified newsletter sponsorships in minutes. AI matching, escrow payments, and placement guarantees for B2B marketers.",
  openGraph: {
    title: "Stroby - AI-Powered Newsletter Sponsorship Marketplace",
    description:
      "Find and book verified newsletter sponsorships in minutes. AI matching, escrow payments, and placement guarantees for B2B marketers.",
    url: "https://stroby.ai",
    siteName: "Stroby",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stroby - AI-Powered Newsletter Sponsorship Marketplace",
    description:
      "Find and book verified newsletter sponsorships in minutes. AI matching, escrow payments, and placement guarantees for B2B marketers.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
