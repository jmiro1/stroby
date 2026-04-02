import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account Verified",
  description: "Your WhatsApp is now connected to Stroby AI.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
