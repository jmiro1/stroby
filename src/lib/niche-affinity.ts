// Cross-niche affinity map — which niches have overlapping audiences
// Each niche maps to related niches (ordered by relevance)

export const NICHE_AFFINITY: Record<string, string[]> = {
  "SaaS & Software": ["AI & Data", "Dev Tools & Engineering", "Marketing & Growth", "Startups & VC", "Design & Product"],
  "Marketing & Growth": ["SaaS & Software", "E-commerce & DTC", "Creator Economy", "Sales & Revenue", "AI & Data"],
  "Sales & Revenue": ["Marketing & Growth", "SaaS & Software", "E-commerce & DTC", "Startups & VC"],
  "Startups & VC": ["SaaS & Software", "Fintech & Finance", "AI & Data", "Marketing & Growth", "Creator Economy"],
  "Fintech & Finance": ["Startups & VC", "Crypto & Web3", "SaaS & Software", "Real Estate"],
  "E-commerce & DTC": ["Marketing & Growth", "Fashion & Beauty", "Food & Beverage", "Sales & Revenue"],
  "AI & Data": ["SaaS & Software", "Dev Tools & Engineering", "Startups & VC", "Education & Learning"],
  "Design & Product": ["SaaS & Software", "Creator Economy", "Marketing & Growth", "Dev Tools & Engineering"],
  "HR & Leadership": ["SaaS & Software", "Education & Learning", "Startups & VC"],
  "Creator Economy": ["Marketing & Growth", "Entertainment & Media", "Fashion & Beauty", "Design & Product"],
  "Health & Wellness": ["Sports & Fitness", "Food & Beverage", "Sustainability & Climate"],
  "Real Estate": ["Fintech & Finance", "Startups & VC"],
  "Travel & Hospitality": ["Food & Beverage", "Entertainment & Media", "Sustainability & Climate"],
  "Food & Beverage": ["Health & Wellness", "E-commerce & DTC", "Travel & Hospitality", "Sustainability & Climate"],
  "Fashion & Beauty": ["E-commerce & DTC", "Creator Economy", "Entertainment & Media"],
  "Sports & Fitness": ["Health & Wellness", "E-commerce & DTC", "Entertainment & Media"],
  "Education & Learning": ["AI & Data", "SaaS & Software", "HR & Leadership", "Dev Tools & Engineering"],
  "Entertainment & Media": ["Creator Economy", "Fashion & Beauty", "Sports & Fitness", "Travel & Hospitality"],
  "Sustainability & Climate": ["Health & Wellness", "Food & Beverage", "Travel & Hospitality", "Real Estate"],
  "Crypto & Web3": ["Fintech & Finance", "AI & Data", "Startups & VC", "Dev Tools & Engineering"],
  "Dev Tools & Engineering": ["SaaS & Software", "AI & Data", "Education & Learning", "Design & Product"],
};

// Get niches to search for a given business niche (primary + related)
export function getSearchNiches(niche: string | null): string[] {
  if (!niche) return [];
  const related = NICHE_AFFINITY[niche] || [];
  return [niche, ...related];
}
