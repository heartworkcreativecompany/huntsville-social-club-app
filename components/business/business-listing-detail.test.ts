import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import BusinessListingDetail from '@/components/business/business-listing-detail'
import type { PublicBusinessListing } from '@/lib/business-listing-directory'

const phoneNumber = '2564341119'
const ownerId = 'owner_123456789'
const listingId = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'

const longDescription = [
  'Body contouring and wellness treatments in Huntsville.',
  'Members can book lymphatic drainage, sculpting, and recovery sessions.',
  'Walk-ins are welcome on weekdays after 2pm when the studio has openings.',
].join('\n\n')

function listing(
  patch: Partial<PublicBusinessListing> = {}
): PublicBusinessListing {
  return {
    id: listingId,
    business_name: 'The Venus Body Shop',
    description: longDescription,
    industry: 'health_wellness',
    website_url: 'www.TheVenusBodyShop.com',
    city: 'Huntsville',
    club_offer: '10% off for club members on contouring packages.',
    header_image_url: '/listings/venus-logo.png',
    status: 'approved',
    ...patch,
  }
}

function hasNestedAnchors(html: string): boolean {
  return /<a\b[^>]*>(?:(?!<\/a>)[\s\S])*?<a\b/i.test(html)
}

describe('BusinessListingDetail', () => {
  it('renders the full description without line clamping', () => {
    const html = renderToStaticMarkup(
      createElement(BusinessListingDetail, { listing: listing() })
    )

    expect(html).toContain(longDescription)
    expect(html).toContain('whitespace-pre-wrap')
    expect(html).not.toContain('line-clamp-3')
    expect(html).not.toContain('line-clamp-2')
  })

  it('renders the full Club Offer and a Back to Business Directory link', () => {
    const html = renderToStaticMarkup(
      createElement(BusinessListingDetail, { listing: listing() })
    )

    expect(html).toContain('Club Offer')
    expect(html).toContain('10% off for club members on contouring packages.')
    expect(html).toContain('href="/business"')
    expect(html).toContain('Back to Business Directory')
  })

  it('keeps Visit website as a separate external https link', () => {
    const html = renderToStaticMarkup(
      createElement(BusinessListingDetail, { listing: listing() })
    )

    expect(html).toContain('href="https://www.TheVenusBodyShop.com"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('Visit website ↗')
    expect(html).not.toContain(`href="/business/${listingId}"`)
    expect(hasNestedAnchors(html)).toBe(false)
  })

  it('does not render unsafe website values as clickable external links', () => {
    const html = renderToStaticMarkup(
      createElement(BusinessListingDetail, {
        listing: listing({ website_url: 'javascript:alert(1)' }),
      })
    )

    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('Visit website')
    expect(html).toContain('Back to Business Directory')
  })

  it('does not render a public phone, user, or listing identifier', () => {
    const extra = {
      ...listing(),
      phone: phoneNumber,
      owner_id: ownerId,
    }
    const html = renderToStaticMarkup(
      createElement(BusinessListingDetail, { listing: extra })
    )

    expect(html).not.toContain(phoneNumber)
    expect(html).not.toContain(ownerId)
    expect(html).not.toContain(listingId)
  })
})

describe('business listing detail route', () => {
  it('loads only approved listings by the canonical UUID slug', () => {
    const page = readFileSync(
      join(__dirname, '../../app/(club)/business/[slug]/page.tsx'),
      'utf8'
    )

    expect(page).toContain("params: Promise<{ slug: string }>")
    expect(page).toContain('parseBusinessListingDetailSlug')
    expect(page).toContain('resolveApprovedPublicBusinessListing')
    expect(page).toContain(".eq('status', 'approved')")
    expect(page).toContain('PUBLIC_BUSINESS_LISTING_SELECT')
    expect(page).toContain("redirect('/login')")
    expect(page).toContain("redirect('/application')")
    expect(page).toContain('Listing not found')
    expect(page).not.toContain('phone')
    expect(page).not.toContain('owner_id')
    expect(page).not.toContain('admin_notes')
  })
})
