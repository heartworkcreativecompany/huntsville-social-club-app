import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import BusinessDirectoryCard from '@/components/business/business-directory-card'
import type { PublicBusinessListing } from '@/lib/business-listing-directory'

const phoneNumber = '2564341119'
const ownerId = 'owner_123456789'
const listingId = 'listing-venus-1'

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

describe('BusinessDirectoryCard', () => {
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
    expect(html).not.toMatch(/<a\s/i)
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
  })

  it('renders content in image → name → location → description → Club Offer → website order', () => {
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
    const websiteIdx = html.indexOf('Visit website ↗')

    expect(imageIdx).toBeGreaterThanOrEqual(0)
    expect(nameIdx).toBeGreaterThan(imageIdx)
    expect(cityIdx).toBeGreaterThan(nameIdx)
    expect(descriptionIdx).toBeGreaterThan(cityIdx)
    expect(offerLabelIdx).toBeGreaterThan(descriptionIdx)
    expect(offerTextIdx).toBeGreaterThan(offerLabelIdx)
    expect(websiteIdx).toBeGreaterThan(offerTextIdx)
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

  it('does not use Next.js Link for merchant websites', () => {
    const source = readFileSync(
      join(__dirname, 'business-directory-card.tsx'),
      'utf8'
    )
    expect(source).not.toContain("from 'next/link'")
    expect(source).not.toContain('from "next/link"')
    expect(source).toContain('normalizeBusinessWebsiteUrl')
    expect(source).not.toMatch(/\bphone\b/)
  })
})
