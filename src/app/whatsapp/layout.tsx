import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Message Stroby on WhatsApp",
  description:
    "Chat with Stroby for native brand distribution. Connect with creators and communities who genuinely care — all through WhatsApp.",
  openGraph: {
    title: "Message Stroby on WhatsApp",
    description:
      "Native brand distribution through real communities. Connect with the right creators through authentic conversations.",
    url: "/whatsapp",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Message Stroby on WhatsApp",
    description:
      "Native brand distribution through real communities. Connect with the right creators through authentic conversations.",
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
