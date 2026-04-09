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

const seoDescription =
  "Hey, I'm Stroby! An AI Superconnector connecting businesses, influencers and other curious humans through real conversations and warm introductions on WhatsApp. Get the right brand placements for your business, and the right products to represent for your audience.";

export const metadata: Metadata = {
  metadataBase: new URL("https://stroby.ai"),
  title: {
    default: "Stroby - AI Superconnector for Brand Distribution",
    template: "%s | Stroby",
  },
  description: seoDescription,
  keywords: [
    "brand distribution",
    "influencer marketing",
    "influencer matching",
    "AI influencer platform",
    "brand partnerships",
    "creator sponsorships",
    "AI matchmaker",
    "connect with influencers",
    "brand placement",
    "marketing distribution",
    "WhatsApp business",
    "Stroby",
  ],
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
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
    title: "Stroby - AI Superconnector for Brand Distribution",
    description: seoDescription,
    url: "https://stroby.ai",
    siteName: "Stroby",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Stroby - AI Superconnector for Brand Distribution",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Stroby - AI Superconnector for Brand Distribution",
    description: seoDescription,
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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-KGZG4D6L');`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-KGZG4D6L"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              {
                "@context": "https://schema.org",
                "@type": "Organization",
                name: "Stroby",
                url: "https://stroby.ai",
                logo: "https://stroby.ai/logo-emoji.png",
                description:
                  "AI Superconnector for brand distribution. Connecting businesses, influencers and creators through real conversations and warm introductions on WhatsApp.",
                sameAs: [
                  "https://www.linkedin.com/company/stroby",
                  "https://x.com/strobyai",
                ],
              },
              {
                "@context": "https://schema.org",
                "@type": "WebSite",
                name: "Stroby",
                url: "https://stroby.ai",
                description:
                  "AI Superconnector connecting businesses, influencers and other curious humans through real conversations and warm introductions on WhatsApp. Get the right brand placements for your business, and the right products to represent for your audience.",
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
                      text: "Stroby uses AI to match businesses with the most relevant influencers and creators based on niche, audience demographics, and budget. Both sides opt in before a deal is made. Payments are held in escrow until the placement runs and proof of performance is submitted.",
                    },
                  },
                  {
                    "@type": "Question",
                    name: "How much does Stroby cost?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: "Stroby is completely free for influencers and creators. For businesses, we charge a commission on each successful transaction. There are no upfront fees, subscriptions, or hidden costs.",
                    },
                  },
                  {
                    "@type": "Question",
                    name: "How do you verify metrics?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: "We use direct API integrations with major platforms to pull real audience and engagement data. For platforms without API access, we use verified screenshot submissions with timestamp validation.",
                    },
                  },
                  {
                    "@type": "Question",
                    name: "What is the placement guarantee?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: "If actual performance metrics fall significantly short of what was promised, Stroby will issue a partial or full refund to the business from the escrowed funds.",
                    },
                  },
                  {
                    "@type": "Question",
                    name: "How does the escrow system work?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: "When a partnership is booked, the business pays into Stroby's escrow. The funds are held securely while the placement runs. Once proof of placement is submitted and metrics are verified, the funds are released to the influencer or creator.",
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
                      text: "Stroby supports SaaS, Marketing, Sales, Fintech, AI, E-commerce, Health & Wellness, Travel, Fashion, Sports, Education, Entertainment, and many more. If your niche isn't listed, sign up anyway — our AI will find you the best matches.",
                    },
                  },
                  {
                    "@type": "Question",
                    name: "Can I use Stroby if I'm an agency?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: "Yes! Agencies are welcome. You can onboard each of your clients individually, manage multiple campaigns, and take advantage of our AI matching across all of your accounts.",
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
