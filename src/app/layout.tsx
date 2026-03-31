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
  metadataBase: new URL("https://stroby.ai"),
  title: {
    default: "Stroby - AI-Powered Newsletter Sponsorship Marketplace",
    template: "%s | Stroby",
  },
  description:
    "Find and book verified newsletter sponsorships in minutes. AI matching, escrow payments, and placement guarantees for B2B marketers.",
  keywords: [
    "newsletter sponsorship",
    "newsletter advertising",
    "sponsor a newsletter",
    "newsletter marketplace",
    "B2B newsletter ads",
    "newsletter monetization",
    "AI sponsorship matching",
    "email newsletter sponsorship",
    "newsletter ad platform",
    "Stroby",
  ],
  authors: [{ name: "Stroby" }],
  creator: "Stroby",
  publisher: "Stroby",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "https://stroby.ai",
  },
  openGraph: {
    title: "Stroby - AI-Powered Newsletter Sponsorship Marketplace",
    description:
      "Find and book verified newsletter sponsorships in minutes. AI matching, escrow payments, and placement guarantees for B2B marketers.",
    url: "https://stroby.ai",
    siteName: "Stroby",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Stroby - AI-Powered Newsletter Sponsorship Marketplace",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Stroby - AI-Powered Newsletter Sponsorship Marketplace",
    description:
      "Find and book verified newsletter sponsorships in minutes. AI matching, escrow payments, and placement guarantees for B2B marketers.",
    images: ["/og-image.png"],
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
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              {
                "@context": "https://schema.org",
                "@type": "Organization",
                name: "Stroby",
                url: "https://stroby.ai",
                logo: "https://stroby.ai/og-image.png",
                description:
                  "AI-powered newsletter sponsorship marketplace. Find and book verified newsletter sponsorships in minutes.",
                sameAs: [],
              },
              {
                "@context": "https://schema.org",
                "@type": "WebSite",
                name: "Stroby",
                url: "https://stroby.ai",
                description:
                  "Find and book verified newsletter sponsorships in minutes. AI matching, escrow payments, and placement guarantees for B2B marketers.",
                potentialAction: {
                  "@type": "SearchAction",
                  target: "https://stroby.ai/?q={search_term_string}",
                  "query-input": "required name=search_term_string",
                },
              },
              {
                "@context": "https://schema.org",
                "@type": "FAQPage",
                mainEntity: [
                  {
                    "@type": "Question",
                    name: "How does Stroby work?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: "Stroby uses AI to match businesses with the most relevant newsletters based on niche, audience demographics, and budget. Both sides opt in before a deal is made. Payments are held in escrow until the placement runs and proof of performance is submitted.",
                    },
                  },
                  {
                    "@type": "Question",
                    name: "How much does Stroby cost?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: "Stroby is completely free for newsletter owners. For businesses, we charge a 15% commission on each transaction. There are no upfront fees, subscriptions, or hidden costs.",
                    },
                  },
                  {
                    "@type": "Question",
                    name: "How do you verify newsletter metrics?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: "We use direct API integrations with major email service providers (like Beehiiv, ConvertKit, and Mailchimp) to pull real subscriber and engagement data. For platforms without API access, we use verified screenshot submissions with timestamp validation.",
                    },
                  },
                  {
                    "@type": "Question",
                    name: "What is the placement guarantee?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: "If a newsletter's actual performance metrics fall significantly short of what was promised (e.g., open rates, subscriber count), Stroby will issue a partial or full refund to the business from the escrowed funds.",
                    },
                  },
                  {
                    "@type": "Question",
                    name: "How does the escrow system work?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: "When a sponsorship is booked, the business pays into Stroby's escrow. The funds are held securely while the placement runs. Once the newsletter submits proof of placement and metrics are verified, the funds are released to the newsletter owner.",
                    },
                  },
                  {
                    "@type": "Question",
                    name: "How long does matching take?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: "Most users receive their first match within 48 hours of completing onboarding. For popular niches, matches can come in within minutes.",
                    },
                  },
                  {
                    "@type": "Question",
                    name: "What niches does Stroby support?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: "Stroby currently supports B2B, SaaS, Marketing, Fintech, AI/ML, Developer Tools, and more. We're continuously expanding our marketplace.",
                    },
                  },
                  {
                    "@type": "Question",
                    name: "Can I use Stroby if I'm an agency?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: "Yes! Agencies are welcome on Stroby. You can onboard each of your clients individually, manage multiple campaigns, and take advantage of our AI matching across all of your accounts.",
                    },
                  },
                ],
              },
            ]),
          }}
        />
        {children}
      </body>
    </html>
  );
}
