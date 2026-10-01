/**
 * Canonical industry options shared by the membership application,
 * Business Directory listings, and member-directory filters.
 * Persisted values are snake_case slugs; labels are member-facing.
 */

export const INDUSTRY_OPTIONS = [
  { value: 'aerospace_aviation_space', label: 'Aerospace, Aviation & Space' },
  {
    value: 'artificial_intelligence_data_machine_learning',
    label: 'Artificial Intelligence, Data & Machine Learning',
  },
  {
    value: 'automotive_manufacturing_skilled_trades',
    label: 'Automotive, Manufacturing & Skilled Trades',
  },
  {
    value: 'biotechnology_life_sciences_healthcare_innovation',
    label: 'Biotechnology, Life Sciences & Healthcare Innovation',
  },
  {
    value: 'business_services_consulting',
    label: 'Business Services & Consulting',
  },
  {
    value: 'construction_architecture_real_estate',
    label: 'Construction, Architecture & Real Estate',
  },
  { value: 'cybersecurity_it_software', label: 'Cybersecurity, IT & Software' },
  {
    value: 'defense_national_security_government_contracting',
    label: 'Defense, National Security & Government Contracting',
  },
  {
    value: 'education_research_academia',
    label: 'Education, Research & Academia',
  },
  { value: 'engineering', label: 'Engineering' },
  { value: 'entrepreneurship_startups', label: 'Entrepreneurship & Startups' },
  {
    value: 'finance_accounting_insurance',
    label: 'Finance, Accounting & Insurance',
  },
  { value: 'government_public_service', label: 'Government & Public Service' },
  { value: 'healthcare_wellness', label: 'Healthcare & Wellness' },
  {
    value: 'hospitality_food_beverage_tourism',
    label: 'Hospitality, Food, Beverage & Tourism',
  },
  {
    value: 'human_resources_recruiting_staffing',
    label: 'Human Resources, Recruiting & Staffing',
  },
  { value: 'legal_services', label: 'Legal Services' },
  {
    value: 'marketing_media_design_communications',
    label: 'Marketing, Media, Design & Communications',
  },
  {
    value: 'nonprofit_community_social_impact',
    label: 'Nonprofit, Community & Social Impact',
  },
  {
    value: 'operations_logistics_supply_chain',
    label: 'Operations, Logistics & Supply Chain',
  },
  {
    value: 'retail_consumer_services_personal_care',
    label: 'Retail, Consumer Services & Personal Care',
  },
  {
    value: 'sales_business_development',
    label: 'Sales & Business Development',
  },
  {
    value: 'science_research_laboratory_services',
    label: 'Science, Research & Laboratory Services',
  },
  {
    value: 'telecommunications_technology_infrastructure',
    label: 'Telecommunications & Technology Infrastructure',
  },
  { value: 'other', label: 'Other' },
] as const

/**
 * Previously selectable slugs. Still valid for stored applications, profiles,
 * and business listings. Not offered as new choices.
 */
export const HISTORICAL_INDUSTRY_OPTIONS = [
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
  { value: 'marketing_media', label: 'Marketing & Media' },
  { value: 'personal_services', label: 'Personal Services' },
  { value: 'pet_services', label: 'Pet Services' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'technology', label: 'Technology' },
  { value: 'wellness_fitness', label: 'Wellness & Fitness' },
] as const

export type IndustryValue = (typeof INDUSTRY_OPTIONS)[number]['value']
export type HistoricalIndustryValue =
  (typeof HISTORICAL_INDUSTRY_OPTIONS)[number]['value']
export type StoredIndustryValue = IndustryValue | HistoricalIndustryValue

const INDUSTRY_VALUES = new Set<string>(
  INDUSTRY_OPTIONS.map((option) => option.value)
)

const HISTORICAL_INDUSTRY_VALUES = new Set<string>(
  HISTORICAL_INDUSTRY_OPTIONS.map((option) => option.value)
)

const INDUSTRY_LABEL_BY_VALUE = Object.fromEntries([
  ...INDUSTRY_OPTIONS.map((option) => [option.value, option.label]),
  ...HISTORICAL_INDUSTRY_OPTIONS.map((option) => [option.value, option.label]),
]) as Record<StoredIndustryValue, string>

const INDUSTRY_ORDER = new Map(
  INDUSTRY_OPTIONS.map((option, index) => [option.value, index])
)

const HISTORICAL_ORDER = new Map(
  HISTORICAL_INDUSTRY_OPTIONS.map((option, index) => [
    option.value,
    INDUSTRY_OPTIONS.length + index,
  ])
)

export function isIndustryValue(value: string): value is IndustryValue {
  return INDUSTRY_VALUES.has(value)
}

export function isHistoricalIndustryValue(
  value: string
): value is HistoricalIndustryValue {
  return HISTORICAL_INDUSTRY_VALUES.has(value)
}

export function isStoredIndustryValue(
  value: string
): value is StoredIndustryValue {
  return isIndustryValue(value) || isHistoricalIndustryValue(value)
}

/** Validate a current or historically stored industry slug. */
export function parseIndustryValue(
  value: string | null | undefined
): StoredIndustryValue | null {
  const trimmed = value?.trim() ?? ''
  if (!trimmed || !isStoredIndustryValue(trimmed)) return null
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
  if (isStoredIndustryValue(trimmed)) {
    return INDUSTRY_LABEL_BY_VALUE[trimmed]
  }
  return trimmed
}

/** Sort key: current options, then historical slugs, then free text. */
export function industrySortIndex(value: string | null | undefined): number {
  const trimmed = value?.trim() ?? ''
  if (trimmed && isIndustryValue(trimmed)) {
    return INDUSTRY_ORDER.get(trimmed) ?? INDUSTRY_OPTIONS.length
  }
  if (trimmed && isHistoricalIndustryValue(trimmed)) {
    return (
      HISTORICAL_ORDER.get(trimmed) ??
      INDUSTRY_OPTIONS.length + HISTORICAL_INDUSTRY_OPTIONS.length
    )
  }
  return INDUSTRY_OPTIONS.length + HISTORICAL_INDUSTRY_OPTIONS.length
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
