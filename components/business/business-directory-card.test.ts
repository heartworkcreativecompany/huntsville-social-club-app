import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import BusinessDirectoryCard from '@/components/business/business-directory-card'
import {
  businessListingDetailHref,
  type PublicBusinessListing,
} from '@/lib/business-listing-directory'

const phoneNumber = '2564341119'
const ownerId = 'owner_123456789'
const listingId = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'
const detailHref = `/business/${listingId}`

function listing(
  patch: Partial<PublicBusinessListing> = {}
): PublicBusinessListing {
  return {
    id: listingId,
    business_name: 'The Venus Body Shop',
    description: 'Body contouring and wellness treatments in Huntsville.',
    industry: 'health_wellness',
    website_url: 'www.TheVenusBodyShop.com',
    city: 'Huntsville',
    club_offer: '10% off for club members',
    header_image_url: '/listings/venus-logo.png',
    status: 'approved',
    ...patch,
  }
}

function hasNestedAnchors(html: string): boolean {
  return /<a\b[^>]*>(?:(?!<\/a>)[\s\S])*?<a\b/i.test(html)
}

describe('BusinessDirectoryCard', () => {
  it('renders an internal View details link using the listing UUID slug', () => {
    const html = renderToStaticMarkup(
      createElement(BusinessDirectoryCard, { listing: listing() })
    )

    expect(businessListingDetailHref(listing())).toBe(detailHref)
    expect(html).toContain(`href="${detailHref}"`)
    expect(html).toContain('View details →')
    expect(html).toContain('View The Venus Body Shop details')
  })

  it('renders www.TheVenusBodyShop.com as an external https link in a new tab', () => {
    const html = renderToStaticMarkup(
      createElement(BusinessDirectoryCard, { listing: listing() })
    )

    expect(html).toContain('href="https://www.TheVenusBodyShop.com"')
    expect(html).not.toContain('href="www.TheVenusBodyShop.com"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('Visit The Venus Body Shop website')
    expect(html).toContain('Visit website ↗')
    expect(html).not.toContain('href="/business/https://www.TheVenusBodyShop.com"')
  })

  it('keeps the external website link separate from the internal detail href', () => {
    const html = renderToStaticMarkup(
      createElement(BusinessDirectoryCard, { listing: listing() })
    )

    expect(html).toContain(`href="${detailHref}"`)
    expect(html).toContain('href="https://www.TheVenusBodyShop.com"')
    expect(html).toContain('View details →')
    expect(html).toContain('Visit website ↗')
    expect(hasNestedAnchors(html)).toBe(false)
  })

  it('keeps an existing https:// website URL', () => {
    const html = renderToStaticMarkup(
      createElement(BusinessDirectoryCard, {
        listing: listing({
          website_url: 'https://www.TheVenusBodyShop.com',
        }),
      })
    )

    expect(html).toContain('href="https://www.TheVenusBodyShop.com"')
  })

  it('normalizes a bare domain to https://', () => {
    const html = renderToStaticMarkup(
      createElement(BusinessDirectoryCard, {
        listing: listing({ website_url: 'thevenusbodyshop.com' }),
      })
    )

    expect(html).toContain('href="https://thevenusbodyshop.com"')
  })

  it('does not render javascript: as a clickable external link', () => {
    const html = renderToStaticMarkup(
      createElement(BusinessDirectoryCard, {
        listing: listing({ website_url: 'javascript:alert(1)' }),
      })
    )

    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('Visit website')
    expect(html).toContain(`href="${detailHref}"`)
    expect(html).toContain('View details →')
  })

  it('does not turn a relative website value into an internal members-site path', () => {
    const html = renderToStaticMarkup(
      createElement(BusinessDirectoryCard, {
        listing: listing({ website_url: '/business' }),
      })
    )

    expect(html).not.toContain('Visit website')
    expect(html).toContain(`href="${detailHref}"`)
    expect(html).toContain('View details →')
  })

  it('does not render a public phone, user, or listing numeric identifier', () => {
    const extra = {
      ...listing(),
      phone: phoneNumber,
      owner_id: ownerId,
    }
    const html = renderToStaticMarkup(
      createElement(BusinessDirectoryCard, { listing: extra })
    )

    expect(html).not.toContain(phoneNumber)
    expect(html).not.toContain(ownerId)
    expect(html).not.toContain(`>${listingId}<`)
  })

  it('renders content in image → name → location → description → Club Offer → details → website order', () => {
    const html = renderToStaticMarkup(
      createElement(BusinessDirectoryCard, { listing: listing() })
    )

    const imageIdx = html.indexOf('/listings/venus-logo.png')
    const nameIdx = html.indexOf('The Venus Body Shop')
    const cityIdx = html.indexOf('Huntsville')
    const descriptionIdx = html.indexOf(
      'Body contouring and wellness treatments in Huntsville.'
    )
    const offerLabelIdx = html.indexOf('Club Offer')
    const offerTextIdx = html.indexOf('10% off for club members')
    const detailsIdx = html.indexOf('View details →')
    const websiteIdx = html.indexOf('Visit website ↗')

    expect(imageIdx).toBeGreaterThanOrEqual(0)
    expect(nameIdx).toBeGreaterThan(imageIdx)
    expect(cityIdx).toBeGreaterThan(nameIdx)
    expect(descriptionIdx).toBeGreaterThan(cityIdx)
    expect(offerLabelIdx).toBeGreaterThan(descriptionIdx)
    expect(offerTextIdx).toBeGreaterThan(offerLabelIdx)
    expect(detailsIdx).toBeGreaterThan(offerTextIdx)
    expect(websiteIdx).toBeGreaterThan(detailsIdx)
  })

  it('uses contain + padding for logo images and cover for photo jpegs', () => {
    const logoHtml = renderToStaticMarkup(
      createElement(BusinessDirectoryCard, { listing: listing() })
    )
    expect(logoHtml).toContain('object-contain')
    expect(logoHtml).toContain('p-4')

    const photoHtml = renderToStaticMarkup(
      createElement(BusinessDirectoryCard, {
        listing: listing({ header_image_url: '/listings/storefront.jpg' }),
      })
    )
    expect(photoHtml).toContain('object-cover')
    expect(photoHtml).not.toContain('object-contain')
  })

  it('uses Next.js Link for internal details and a plain anchor for merchant websites', () => {
    const source = readFileSync(
      join(__dirname, 'business-directory-card.tsx'),
      'utf8'
    )
    expect(source).toContain("from 'next/link'")
    expect(source).toContain('businessListingDetailHref')
    expect(source).toContain('View details →')
    expect(source).toContain('BusinessWebsiteLink')
    expect(source).not.toMatch(/<Link[^>]*websiteHref/)
    expect(source).not.toMatch(/\bphone\b/)
  })
})
