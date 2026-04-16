export const NICHES = [
  "SaaS & Software",
  "Marketing & Growth",
  "Sales & Revenue",
  "Startups & VC",
  "Fintech & Finance",
  "E-commerce & DTC",
  "AI & Data",
  "Design & Product",
  "HR & Leadership",
  "Creator Economy",
  "Health & Wellness",
  "Real Estate",
  "Travel & Hospitality",
  "Food & Beverage",
  "Fashion & Beauty",
  "Sports & Fitness",
  "Education & Learning",
  "Entertainment & Media",
  "Sustainability & Climate",
  "Crypto & Web3",
  "Dev Tools & Engineering",
  "Other",
] as const;

export type Niche = (typeof NICHES)[number];

export const BUDGET_RANGES = [
  "<$500",
  "$500-$1k",
  "$1k-$2.5k",
  "$2.5k-$5k",
  "$5k+",
  "Flexible / varies",
] as const;

export const CAMPAIGN_GOALS = [
  "Brand awareness",
  "Direct response / clicks",
  "Lead generation",
] as const;

export const CAMPAIGN_OUTCOMES = [
  "Reach — maximum eyeballs",
  "Engagement — comments, shares, interaction",
  "Conversions — clicks, signups, sales",
  "Credibility — association with a trusted voice",
  "All of the above",
] as const;

export const CAMPAIGN_OUTCOME_MAP: Record<string, string> = {
  "Reach — maximum eyeballs": "reach",
  "Engagement — comments, shares, interaction": "engagement",
  "Conversions — clicks, signups, sales": "conversions",
  "Credibility — association with a trusted voice": "credibility",
  "All of the above": "all",
};

export const CREATOR_SIZES = [
  "Micro (under 10k)",
  "Mid-tier (10k–100k)",
  "Macro (100k+)",
  "No preference",
] as const;

export const CREATOR_SIZE_MAP: Record<string, string> = {
  "Micro (under 10k)": "micro",
  "Mid-tier (10k–100k)": "mid",
  "Macro (100k+)": "macro",
  "No preference": "any",
};

export const TIMELINES = ["ASAP", "This month", "Exploring"] as const;

export const AD_FORMATS = [
  "Banner",
  "Native",
  "Dedicated send",
  "Text mention",
] as const;

export const FREQUENCIES = [
  "Daily",
  "Weekly",
  "Biweekly",
  "Monthly",
] as const;

export const PARTNER_PREFERENCES = [
  "Newsletters only",
  "Influencers & creators only",
  "All — newsletters and influencers",
] as const;

export const PARTNER_PREF_MAP: Record<string, string> = {
  "Newsletters only": "newsletters_only",
  "Influencers & creators only": "creators_only",
  "All — newsletters and influencers": "all",
};

export const COMMISSION_RATE = 0.15;
