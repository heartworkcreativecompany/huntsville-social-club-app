import { describe, expect, it } from 'vitest'
import {
  BUSINESS_LISTING_INDUSTRIES,
  compareBusinessListingIndustries,
  formatBusinessListingIndustryLabel,
  isBusinessListingIndustry,
  parseBusinessListingIndustry,
} from '@/lib/business-listing-industries'

describe('business listing industries', () => {
  it('exposes the approved option labels', () => {
    expect(BUSINESS_LISTING_INDUSTRIES.map((o) => o.label)).toEqual([
      'Arts & Entertainment',
      'Automotive',
      'Beauty & Wellness',
      'Business Services',
      'Community & Nonprofit',
      'Construction & Contractors',
      'Education & Training',
      'Events & Weddings',
      'Fashion & Retail',
      'Finance & Insurance',
      'Food & Beverage',
      'Health & Medical',
      'Home Services',
      'Hospitality & Travel',
      'Legal Services',
      'Marketing & Media',
      'Personal Services',
      'Pet Services',
      'Real Estate',
      'Technology',
      'Wellness & Fitness',
      'Other',
    ])
  })

  it('accepts only approved industry values', () => {
    expect(parseBusinessListingIndustry('technology')).toBe('technology')
    expect(parseBusinessListingIndustry('Technology')).toBeNull()
    expect(parseBusinessListingIndustry('Software')).toBeNull()
    expect(isBusinessListingIndustry('food_beverage')).toBe(true)
    expect(isBusinessListingIndustry('food & beverage')).toBe(false)
  })

  it('formats known values and keeps legacy free-text readable', () => {
    expect(formatBusinessListingIndustryLabel('technology')).toBe('Technology')
    expect(formatBusinessListingIndustryLabel('Custom Boutique')).toBe(
      'Custom Boutique'
    )
    expect(formatBusinessListingIndustryLabel('')).toBe('Other')
  })

  it('sorts canonical industries before legacy values', () => {
    expect(compareBusinessListingIndustries('technology', 'other')).toBeLessThan(
      0
    )
    expect(
      compareBusinessListingIndustries('Legacy Shop', 'technology')
    ).toBeGreaterThan(0)
  })
})
