// Profile completeness scoring

interface FieldCheck {
  field: string;
  weight: number; // importance 1-3
  label: string;
}

const NEWSLETTER_FIELDS: FieldCheck[] = [
  { field: "newsletter_name", weight: 3, label: "Newsletter name" },
  { field: "primary_niche", weight: 3, label: "Niche" },
  { field: "description", weight: 2, label: "Audience description" },
  { field: "audience_reach", weight: 3, label: "Audience reach" },
  { field: "engagement_rate", weight: 2, label: "Engagement rate" },
  { field: "price_per_placement", weight: 1, label: "Pricing" },
  { field: "url", weight: 1, label: "URL" },
  { field: "email", weight: 2, label: "Email" },
  { field: "phone", weight: 3, label: "Phone" },
];

const BUSINESS_FIELDS: FieldCheck[] = [
  { field: "company_name", weight: 3, label: "Company name" },
  { field: "product_description", weight: 3, label: "Product description" },
  { field: "target_customer", weight: 2, label: "Target customer" },
  { field: "primary_niche", weight: 3, label: "Niche" },
  { field: "description", weight: 2, label: "Desired audience" },
  { field: "budget_range", weight: 2, label: "Budget" },
  { field: "campaign_outcome", weight: 2, label: "Campaign outcome" },
  { field: "preferred_creator_type", weight: 1, label: "Preferred creator type" },
  { field: "email", weight: 2, label: "Email" },
  { field: "phone", weight: 3, label: "Phone" },
];

export function calculateCompleteness(
  profile: Record<string, unknown>,
  userType: "newsletter" | "business" | "other"
): { score: number; missing: string[] } {
  const fields = userType === "newsletter" ? NEWSLETTER_FIELDS : BUSINESS_FIELDS;

  let totalWeight = 0;
  let filledWeight = 0;
  const missing: string[] = [];

  for (const check of fields) {
    totalWeight += check.weight;
    const value = profile[check.field];
    if (value !== null && value !== undefined && value !== "" && value !== 0) {
      filledWeight += check.weight;
    } else {
      missing.push(check.label);
    }
  }

  // Bonus for verification
  if (userType === "newsletter") {
    totalWeight += 2;
    if (profile.verification_status === "api_verified" || profile.verification_status === "screenshot") {
      filledWeight += 2;
    } else {
      missing.push("Verification");
    }
  }

  const score = Math.round((filledWeight / totalWeight) * 100);
  return { score, missing };
}

export function formatCompletenessForAI(score: number, missing: string[]): string {
  if (score >= 90) return `\nProfile: ${score}% complete`;
  const topMissing = missing.slice(0, 3);
  return `\nProfile: ${score}% complete. Missing: ${topMissing.join(", ")}${missing.length > 3 ? ` (+${missing.length - 3} more)` : ""}`;
}
