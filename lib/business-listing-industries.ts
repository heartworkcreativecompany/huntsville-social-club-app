/**
 * Business Directory industry helpers — aliases of the shared canonical list
 * in lib/industries.ts so listing and membership application stay aligned.
 */

import {
  INDUSTRY_OPTIONS,
  compareIndustries,
  formatIndustryLabel,
  industrySortIndex,
  isIndustryValue,
  parseIndustryValue,
  type IndustryValue,
} from '@/lib/industries'

export const BUSINESS_LISTING_INDUSTRIES = INDUSTRY_OPTIONS

export type BusinessListingIndustry = IndustryValue

export function isBusinessListingIndustry(
  value: string
): value is BusinessListingIndustry {
  return isIndustryValue(value)
}

export function parseBusinessListingIndustry(
  value: string | null | undefined
): BusinessListingIndustry | null {
  return parseIndustryValue(value)
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
  return formatIndustryLabel(trimmed)
}

export function businessListingIndustrySortIndex(
  value: string | null | undefined
): number {
  return industrySortIndex(value)
}

export function compareBusinessListingIndustries(
  a: string | null | undefined,
  b: string | null | undefined
): number {
  return compareIndustries(a, b)
}
