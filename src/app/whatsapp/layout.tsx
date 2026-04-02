import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Message Stroby on WhatsApp",
  description:
    "Chat with Stroby, your AI Superconnector for brand distribution. Get matched with the perfect influencers and newsletters for your business — all through WhatsApp.",
  openGraph: {
    title: "Message Stroby on WhatsApp",
    description:
      "Chat with Stroby, your AI Superconnector. Get matched with influencers and newsletters through real conversations.",
    url: "/whatsapp",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Message Stroby on WhatsApp",
    description:
      "Chat with Stroby, your AI Superconnector. Get matched with influencers and newsletters through real conversations.",
    images: ["/og-image.png"],
  },
};

export default function WhatsAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
