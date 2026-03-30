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
  "Other B2B",
] as const;

export type Niche = (typeof NICHES)[number];

export const BUDGET_RANGES = [
  "<$500",
  "$500-$1k",
  "$1k-$2.5k",
  "$2.5k-$5k",
  "$5k+",
] as const;

export const CAMPAIGN_GOALS = [
  "Brand awareness",
  "Direct response / clicks",
  "Lead generation",
] as const;

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

export const COMMISSION_RATE = 0.15;
