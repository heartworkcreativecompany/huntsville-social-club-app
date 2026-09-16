import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BUSINESS_DIRECTORY_GRID_CLASS,
  PUBLIC_BUSINESS_LISTING_SELECT,
  businessListingDetailHref,
  businessListingImageFit,
  groupPublicBusinessListingsByIndustry,
  parseBusinessListingDetailSlug,
  resolveApprovedPublicBusinessListing,
  type PublicBusinessListing,
} from '@/lib/business-listing-directory'

const repoRoot = join(__dirname, '..')
const listingId = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'

function listing(
  patch: Partial<PublicBusinessListing> = {}
): PublicBusinessListing {
  return {
    id: listingId,
    business_name: 'The Venus Body Shop',
    description: 'Body contouring.',
    industry: 'health_wellness',
    website_url: 'www.TheVenusBodyShop.com',
    city: 'Huntsville',
    club_offer: '10% off',
    header_image_url: null,
    status: 'approved',
    ...patch,
  }
}

describe('groupPublicBusinessListingsByIndustry', () => {
  it('keeps approved listings visible in existing category grouping', () => {
    const sections = groupPublicBusinessListingsByIndustry([
      listing({
        id: 'tech-approved',
        business_name: 'Rocket Code',
        industry: 'technology',
      }),
      listing({
        id: 'wellness-approved',
        business_name: 'The Venus Body Shop',
        industry: 'wellness_fitness',
      }),
      listing({
        id: 'wellness-pending',
        business_name: 'Hidden Spa',
        industry: 'wellness_fitness',
        status: 'pending',
      }),
      listing({
        id: 'tech-rejected',
        business_name: 'Rejected Labs',
        industry: 'technology',
        status: 'rejected',
      }),
    ])

    const labels = sections.map((section) => section.industry)
    expect(labels).toEqual(['Technology', 'Wellness & Fitness'])

    const wellness = sections.find(
      (section) => section.industry === 'Wellness & Fitness'
    )
    const technology = sections.find((section) => section.industry === 'Technology')

    expect(wellness?.listings.map((item) => item.business_name)).toEqual([
      'The Venus Body Shop',
    ])
    expect(technology?.listings.map((item) => item.business_name)).toEqual([
      'Rocket Code',
    ])
  })

  it('does not include draft, private, or unapproved listings', () => {
    const sections = groupPublicBusinessListingsByIndustry([
      listing({ status: 'draft', business_name: 'Draft Co' }),
      listing({ status: 'private', business_name: 'Private Co' }),
      listing({ status: 'unapproved', business_name: 'Unapproved Co' }),
    ])

    expect(sections).toEqual([])
  })
})

describe('business listing detail slug', () => {
  it('uses the listing UUID as the stable /business/[slug] identifier', () => {
    expect(businessListingDetailHref(listing())).toBe(`/business/${listingId}`)
    expect(parseBusinessListingDetailSlug(listingId)).toBe(listingId)
    expect(parseBusinessListingDetailSlug(` ${listingId} `)).toBe(listingId)
  })

  it('rejects malformed slugs and non-approved listings without exposing them', () => {
    expect(parseBusinessListingDetailSlug('apply')).toBeNull()
    expect(parseBusinessListingDetailSlug('not-a-uuid')).toBeNull()
    expect(parseBusinessListingDetailSlug('javascript:alert(1)')).toBeNull()
    expect(parseBusinessListingDetailSlug('owner_123456789')).toBeNull()

    expect(
      resolveApprovedPublicBusinessListing(
        listingId,
        listing({ status: 'pending', business_name: 'Hidden Spa' })
      )
    ).toBeNull()
    expect(
      resolveApprovedPublicBusinessListing(
        listingId,
        listing({ status: 'rejected', business_name: 'Rejected Labs' })
      )
    ).toBeNull()
    expect(
      resolveApprovedPublicBusinessListing(
        listingId,
        listing({ status: 'archived', business_name: 'Archived Co' })
      )
    ).toBeNull()
    expect(resolveApprovedPublicBusinessListing('not-a-uuid', listing())).toBeNull()
    expect(resolveApprovedPublicBusinessListing(listingId, listing())).toEqual(
      listing()
    )
  })
})

describe('businessListingImageFit', () => {
  it('uses contain for logo-style files and cover for jpeg photos', () => {
    expect(businessListingImageFit('/logo.png')).toBe('contain')
    expect(businessListingImageFit('/logo.webp')).toBe('contain')
    expect(businessListingImageFit('/storefront.jpg')).toBe('cover')
    expect(businessListingImageFit('/storefront.jpeg')).toBe('cover')
  })
})

describe('public business directory page', () => {
  it('loads approved listings and uses the member-card grid without rendering phone', () => {
    const page = readFileSync(
      join(repoRoot, 'app/(club)/business/page.tsx'),
      'utf8'
    )

    expect(page).toContain(".eq('status', 'approved')")
    expect(page).toContain('groupPublicBusinessListingsByIndustry')
    expect(page).toContain('BusinessDirectoryCard')
    expect(page).toContain('Apply for listing')
    expect(page).toContain('BUSINESS_DIRECTORY_GRID_CLASS')
    expect(page).toContain('PUBLIC_BUSINESS_LISTING_SELECT')
    expect(page).not.toContain('phone')
    expect(page).not.toContain('owner_id')
    expect(PUBLIC_BUSINESS_LISTING_SELECT).not.toContain('phone')
    expect(PUBLIC_BUSINESS_LISTING_SELECT).not.toContain('owner_id')
  })

  it('matches the member directory responsive grid', () => {
    const memberDirectory = readFileSync(
      join(repoRoot, 'components/members/member-directory-section.tsx'),
      'utf8'
    )
    expect(memberDirectory).toContain(
      'mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3'
    )
    expect(BUSINESS_DIRECTORY_GRID_CLASS).toBe(
      'grid gap-5 sm:grid-cols-2 lg:grid-cols-3'
    )
  })
})
