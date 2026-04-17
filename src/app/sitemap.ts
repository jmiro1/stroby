import type { MetadataRoute } from "next";

const NICHE_SLUGS = [
  "saas-software", "marketing-growth", "sales-revenue", "startups-vc",
  "fintech-finance", "e-commerce-dtc", "ai-data", "design-product",
  "hr-leadership", "creator-economy", "health-wellness", "real-estate",
  "travel-hospitality", "food-beverage", "fashion-beauty", "sports-fitness",
  "education-learning", "entertainment-media", "sustainability-climate",
  "crypto-web3", "dev-tools-engineering",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://stroby.ai";
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/about`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${baseUrl}/whatsapp`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${baseUrl}/newsletters`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${baseUrl}/affiliates`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/terms`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${baseUrl}/privacy`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
  ];

  const nichePages: MetadataRoute.Sitemap = NICHE_SLUGS.map((slug) => ({
    url: `${baseUrl}/newsletters/${slug}`,
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: 0.7,
  }));

  return [...staticPages, ...nichePages];
}
