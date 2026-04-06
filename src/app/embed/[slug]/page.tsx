import Image from "next/image";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase";
import type { Metadata } from "next";

const WA_LINK = "https://wa.me/message/2QFL7QR7EBZTD1";

export const metadata: Metadata = {
  title: "Stroby Embed",
  robots: { index: false, follow: false },
};

async function fetchCreator(slug: string) {
  const supabase = createServiceClient();
  const { data: nl } = await supabase
    .from("newsletter_profiles")
    .select("newsletter_name, primary_niche, avatar_url, verification_status, subscriber_count")
    .eq("slug", slug)
    .single();
  if (nl) return { name: nl.newsletter_name, niche: nl.primary_niche, avatar: nl.avatar_url, verified: nl.verification_status !== "unverified", subs: nl.subscriber_count };

  const { data: other } = await supabase
    .from("other_profiles")
    .select("name, niche, avatar_url, verification_status")
    .eq("slug", slug)
    .single();
  if (other) return { name: other.name, niche: other.niche, avatar: other.avatar_url, verified: other.verification_status !== "unverified", subs: null };

  return null;
}

export default async function EmbedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const creator = await fetchCreator(slug);
  if (!creator) notFound();

  const avatarSrc = creator.avatar || "/logo-emoji.png";

  return (
    <html lang="en">
      <head>
        <style>{`
          html, body { margin: 0; padding: 0; font-family: -apple-system, system-ui, sans-serif; background: transparent; }
          .card { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: white; border-radius: 16px; border: 1px solid #e5e7eb; box-shadow: 0 2px 8px rgba(0,0,0,0.04); max-width: 320px; }
          .avatar { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
          .info { flex: 1; min-width: 0; }
          .name { font-size: 15px; font-weight: 700; color: #111; margin: 0; display: flex; align-items: center; gap: 4px; }
          .niche { font-size: 12px; color: #6b7280; margin: 2px 0 0; }
          .cta { display: inline-block; background: #25D366; color: white; padding: 8px 14px; border-radius: 999px; text-decoration: none; font-size: 12px; font-weight: 600; margin-top: 8px; }
          .verified { color: #10b981; font-size: 12px; }
          .powered { font-size: 10px; color: #9ca3af; margin-top: 6px; text-align: right; }
        `}</style>
      </head>
      <body>
        <div className="card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatarSrc} alt={creator.name} className="avatar" />
          <div className="info">
            <p className="name">
              {creator.name}
              {creator.verified && <span className="verified">✓</span>}
            </p>
            <p className="niche">{creator.niche}{creator.subs ? ` · ${creator.subs.toLocaleString()} subs` : ""}</p>
            <a href={WA_LINK} target="_blank" rel="noopener noreferrer" className="cta">Work with me on Stroby</a>
            <p className="powered">powered by stroby.ai</p>
          </div>
        </div>
      </body>
    </html>
  );
}
