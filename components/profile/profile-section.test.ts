import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ProfileSection from '@/components/profile/profile-section'

const repoRoot = join(__dirname, '../..')

describe('profile mobile sections', () => {
  it('keeps collapsed section content mounted and out of the mobile tab order', () => {
    const html = renderToStaticMarkup(
      createElement(
        'div',
        null,
        createElement(
          ProfileSection,
          { id: 'edit-profile', title: 'Edit profile', summary: 'Pending review' },
          createElement('input', { 'aria-label': 'Display name', defaultValue: 'Ada' })
        ),
        createElement(
          ProfileSection,
          { id: 'contact-email', title: 'Contact email' },
          createElement('input', { 'aria-label': 'Contact email' })
        )
      )
    )

    expect(html).toContain('Edit profile')
    expect(html).toContain('Pending review')
    expect(html).toContain('Contact email')
    expect(html).toContain('aria-label="Display name"')
    expect(html).toContain('value="Ada"')
    expect(html.match(/type="button"/g)?.length).toBe(2)
    expect(html.match(/aria-expanded="false"/g)?.length).toBe(2)
    expect(html).toContain('aria-controls=')
    expect(html).toContain('max-lg:hidden')
    expect(html).toContain('lg:hidden')
  })

  it('places membership above the profile sections', () => {
    const page = readFileSync(join(repoRoot, 'app/(club)/profile/page.tsx'), 'utf8')
    const membership = page.indexOf('<MembershipUsageCard')
    const firstSection = page.indexOf('<ProfileSection')
    const edit = page.indexOf('id="edit-profile"')

    expect(membership).toBeGreaterThan(-1)
    expect(firstSection).toBeGreaterThan(membership)
    expect(edit).toBeGreaterThan(firstSection)
    expect(page.match(/<MembershipUsageCard/g)?.length).toBe(1)
  })

  it('keeps the membership plan, status, and actions outside the details panel', () => {
    const card = readFileSync(
      join(repoRoot, 'components/membership/membership-usage-card.tsx'),
      'utf8'
    )

    expect(card).toContain('display.title')
    expect(card).toContain('display.statusLabel')
    expect(card).toContain('display.upgradeCta')
    expect(card).toContain('Membership details')
    expect(card).toContain('type="button"')
    expect(card).toContain('aria-expanded={detailsOpen}')
    expect(card).toContain('lg:order-2')
    expect(card).toContain('order-2 mt-4')
    expect(card.indexOf('{display.title}')).toBeLessThan(
      card.indexOf('Membership details')
    )
    expect(card.indexOf('{display.statusLabel}')).toBeLessThan(
      card.indexOf('id={detailsId}')
    )
  })
})
