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
      'Aerospace, Aviation & Space',
      'Artificial Intelligence, Data & Machine Learning',
      'Automotive, Manufacturing & Skilled Trades',
      'Biotechnology, Life Sciences & Healthcare Innovation',
      'Business Services & Consulting',
      'Construction, Architecture & Real Estate',
      'Cybersecurity, IT & Software',
      'Defense, National Security & Government Contracting',
      'Education, Research & Academia',
      'Engineering',
      'Entrepreneurship & Startups',
      'Finance, Accounting & Insurance',
      'Government & Public Service',
      'Healthcare & Wellness',
      'Hospitality, Food, Beverage & Tourism',
      'Human Resources, Recruiting & Staffing',
      'Legal Services',
      'Marketing, Media, Design & Communications',
      'Nonprofit, Community & Social Impact',
      'Operations, Logistics & Supply Chain',
      'Retail, Consumer Services & Personal Care',
      'Sales & Business Development',
      'Science, Research & Laboratory Services',
      'Telecommunications & Technology Infrastructure',
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
    expect(compareBusinessListingIndustries('other', 'technology')).toBeLessThan(
      0
    )
    expect(
      compareBusinessListingIndustries('Legacy Shop', 'technology')
    ).toBeGreaterThan(0)
  })
})
