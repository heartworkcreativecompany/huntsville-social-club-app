import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import AdminBusinessListingsCard, {
  ADMIN_BUSINESS_LISTINGS_DESCRIPTION,
  ADMIN_BUSINESS_LISTINGS_HREF,
  ADMIN_BUSINESS_LISTINGS_LABEL,
} from '@/components/admin/admin-business-listings-card'

const repoRoot = join(__dirname, '../..')

describe('Admin dashboard business listings card', () => {
  it('renders one Business Listings link to /admin/business-listings', () => {
    const html = renderToStaticMarkup(createElement(AdminBusinessListingsCard))

    expect(html).toContain(ADMIN_BUSINESS_LISTINGS_LABEL)
    expect(html).toContain(ADMIN_BUSINESS_LISTINGS_DESCRIPTION)
    expect(ADMIN_BUSINESS_LISTINGS_LABEL).toBe('Business Listings')
    expect(ADMIN_BUSINESS_LISTINGS_DESCRIPTION).toBe(
      'Review and approve business directory applications.'
    )
    expect(ADMIN_BUSINESS_LISTINGS_HREF).toBe('/admin/business-listings')
    expect(html).toContain(`href="${ADMIN_BUSINESS_LISTINGS_HREF}"`)
    expect(html.split(`href="${ADMIN_BUSINESS_LISTINGS_HREF}"`).length - 1).toBe(
      1
    )
  })

  it('is mounted on the admin applications dashboard behind the existing admin gate', () => {
    const applicationsPage = readFileSync(
      join(repoRoot, 'app/(club)/admin/applications/page.tsx'),
      'utf8'
    )

    expect(applicationsPage).toContain('AdminBusinessListingsCard')
    expect(applicationsPage).toContain("viewer.role !== 'admin'")
    expect(applicationsPage.split('AdminBusinessListingsCard').length - 1).toBe(
      2
    )
    expect(
      applicationsPage.split('href="/admin/business-listings"').length - 1
    ).toBe(0)
  })

  it('does not add a second review UI or change club-nav authorization', () => {
    const clubNav = readFileSync(join(repoRoot, 'lib/club-nav-items.ts'), 'utf8')
    expect(clubNav).not.toContain('/admin/business-listings')
    expect(clubNav).toContain("href: '/admin/applications'")
    expect(clubNav).toContain("const showAdmin = role === 'admin'")

    const reviewPage = readFileSync(
      join(repoRoot, 'app/(club)/admin/business-listings/page.tsx'),
      'utf8'
    )
    expect(reviewPage).toContain('AdminBusinessListingReview')
    expect(reviewPage).toContain("viewer.role !== 'admin'")
  })
})
