/** Canonical Business Directory industry options (value stored in DB). */

export const BUSINESS_LISTING_INDUSTRIES = [
  { value: 'arts_entertainment', label: 'Arts & Entertainment' },
  { value: 'automotive', label: 'Automotive' },
  { value: 'beauty_wellness', label: 'Beauty & Wellness' },
  { value: 'business_services', label: 'Business Services' },
  { value: 'community_nonprofit', label: 'Community & Nonprofit' },
  { value: 'construction_contractors', label: 'Construction & Contractors' },
  { value: 'education_training', label: 'Education & Training' },
  { value: 'events_weddings', label: 'Events & Weddings' },
  { value: 'fashion_retail', label: 'Fashion & Retail' },
  { value: 'finance_insurance', label: 'Finance & Insurance' },
  { value: 'food_beverage', label: 'Food & Beverage' },
  { value: 'health_medical', label: 'Health & Medical' },
  { value: 'home_services', label: 'Home Services' },
  { value: 'hospitality_travel', label: 'Hospitality & Travel' },
  { value: 'legal_services', label: 'Legal Services' },
  { value: 'marketing_media', label: 'Marketing & Media' },
  { value: 'personal_services', label: 'Personal Services' },
  { value: 'pet_services', label: 'Pet Services' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'technology', label: 'Technology' },
  { value: 'wellness_fitness', label: 'Wellness & Fitness' },
  { value: 'other', label: 'Other' },
] as const

export type BusinessListingIndustry =
  (typeof BUSINESS_LISTING_INDUSTRIES)[number]['value']

const INDUSTRY_VALUES = new Set<string>(
  BUSINESS_LISTING_INDUSTRIES.map((option) => option.value)
)

const INDUSTRY_LABEL_BY_VALUE = Object.fromEntries(
  BUSINESS_LISTING_INDUSTRIES.map((option) => [option.value, option.label])
) as Record<BusinessListingIndustry, string>

const INDUSTRY_ORDER = new Map(
  BUSINESS_LISTING_INDUSTRIES.map((option, index) => [option.value, index])
)

export function isBusinessListingIndustry(
  value: string
): value is BusinessListingIndustry {
  return INDUSTRY_VALUES.has(value)
}

/** Validate and normalize a submitted industry value. */
export function parseBusinessListingIndustry(
  value: string | null | undefined
): BusinessListingIndustry | null {
  const trimmed = value?.trim() ?? ''
  if (!trimmed || !isBusinessListingIndustry(trimmed)) return null
  return trimmed
}

/**
 * Display label for stored industry.
 * Known slugs → approved labels; legacy free-text values render as-is.
 */
export function formatBusinessListingIndustryLabel(
  value: string | null | undefined
): string {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return 'Other'
  if (isBusinessListingIndustry(trimmed)) {
    return INDUSTRY_LABEL_BY_VALUE[trimmed]
  }
  return trimmed
}

/** Sort key: canonical list order, then legacy free-text alphabetically after. */
export function businessListingIndustrySortIndex(
  value: string | null | undefined
): number {
  const trimmed = value?.trim() ?? ''
  if (trimmed && isBusinessListingIndustry(trimmed)) {
    return INDUSTRY_ORDER.get(trimmed) ?? BUSINESS_LISTING_INDUSTRIES.length
  }
  return BUSINESS_LISTING_INDUSTRIES.length
}

export function compareBusinessListingIndustries(
  a: string | null | undefined,
  b: string | null | undefined
): number {
  const indexDiff =
    businessListingIndustrySortIndex(a) - businessListingIndustrySortIndex(b)
  if (indexDiff !== 0) return indexDiff
  return formatBusinessListingIndustryLabel(a).localeCompare(
    formatBusinessListingIndustryLabel(b)
  )
}
