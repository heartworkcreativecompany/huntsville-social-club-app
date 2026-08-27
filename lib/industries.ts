/**
 * Canonical industry options shared by the membership application,
 * Business Directory listings, and member-directory filters.
 * Persisted values are snake_case slugs; labels are member-facing.
 */

export const INDUSTRY_OPTIONS = [
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

export type IndustryValue = (typeof INDUSTRY_OPTIONS)[number]['value']

const INDUSTRY_VALUES = new Set<string>(
  INDUSTRY_OPTIONS.map((option) => option.value)
)

const INDUSTRY_LABEL_BY_VALUE = Object.fromEntries(
  INDUSTRY_OPTIONS.map((option) => [option.value, option.label])
) as Record<IndustryValue, string>

const INDUSTRY_ORDER = new Map(
  INDUSTRY_OPTIONS.map((option, index) => [option.value, index])
)

export function isIndustryValue(value: string): value is IndustryValue {
  return INDUSTRY_VALUES.has(value)
}

/** Validate and normalize a submitted canonical industry value. */
export function parseIndustryValue(
  value: string | null | undefined
): IndustryValue | null {
  const trimmed = value?.trim() ?? ''
  if (!trimmed || !isIndustryValue(trimmed)) return null
  return trimmed
}

/**
 * Display label for stored industry.
 * Known slugs → approved labels; legacy free-text values render as-is.
 * Empty values stay empty (callers that want a fallback can supply one).
 */
export function formatIndustryLabel(
  value: string | null | undefined
): string {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return ''
  if (isIndustryValue(trimmed)) {
    return INDUSTRY_LABEL_BY_VALUE[trimmed]
  }
  return trimmed
}

/** Sort key: canonical list order, then legacy free-text alphabetically after. */
export function industrySortIndex(value: string | null | undefined): number {
  const trimmed = value?.trim() ?? ''
  if (trimmed && isIndustryValue(trimmed)) {
    return INDUSTRY_ORDER.get(trimmed) ?? INDUSTRY_OPTIONS.length
  }
  return INDUSTRY_OPTIONS.length
}

export function compareIndustries(
  a: string | null | undefined,
  b: string | null | undefined
): number {
  const indexDiff = industrySortIndex(a) - industrySortIndex(b)
  if (indexDiff !== 0) return indexDiff
  return formatIndustryLabel(a).localeCompare(formatIndustryLabel(b))
}

/**
 * Directory filter match: canonical slug equality, or a legacy free-text
 * value whose display label equals the selected option's label.
 */
export function memberIndustryMatchesFilter(
  stored: string | null | undefined,
  selected: string | null | undefined
): boolean {
  const filter = selected?.trim() ?? ''
  if (!filter || filter === 'all') return true
  const value = stored?.trim() ?? ''
  if (!value) return false
  if (value === filter) return true
  return formatIndustryLabel(value) === formatIndustryLabel(filter)
}
