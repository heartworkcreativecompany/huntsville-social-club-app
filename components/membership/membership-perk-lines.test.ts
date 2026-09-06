import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import MembershipPerkLines from '@/components/membership/membership-perk-lines'
import PricingPlanCards from '@/components/membership/pricing-plan-cards'
import PricingComparisonTable from '@/components/membership/pricing-comparison-table'
import { ELITE_CIRCLE_SOCIALS_INCLUDED_COPY } from '@/lib/membership-pricing-copy'
import { innerCircleSocialRemainingHeadline } from '@/lib/membership-pricing-copy'

describe('membership perks UI copy and wrapping', () => {
  it('renders Inner Circle counters with wrapping-safe classes', () => {
    const html = renderToStaticMarkup(
      createElement(MembershipPerkLines, {
        lines: [
          'You have 1 of 1 included premium event credit remaining this billing period.',
          innerCircleSocialRemainingHeadline(2),
        ],
      })
    )

    expect(html).toContain(
      'You have 1 of 1 included premium event credit remaining this billing period.'
    )
    expect(html).toContain(innerCircleSocialRemainingHeadline(2))
    expect(html).toContain('break-words')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('min-w-0')
    expect(html).not.toContain('whitespace-nowrap')
  })

  it('renders Elite included Circle Social copy without a numeric counter', () => {
    const html = renderToStaticMarkup(
      createElement(MembershipPerkLines, {
        lines: [
          'You have 2 of 2 included premium event credits remaining this billing period',
          ELITE_CIRCLE_SOCIALS_INCLUDED_COPY,
        ],
      })
    )

    expect(html).toContain(ELITE_CIRCLE_SOCIALS_INCLUDED_COPY)
    expect(html).not.toMatch(/of 2 included Circle Social/)
  })
})

describe('Upgrade / pricing surfaces', () => {
  it('shows Inner Circle credit benefits and Elite included Circle Socials', () => {
    const cards = renderToStaticMarkup(
      createElement(PricingPlanCards, { mode: 'public' })
    )
    const table = renderToStaticMarkup(createElement(PricingComparisonTable))
    const html = `${cards}\n${table}`

    expect(html).toContain('$9.99/month')
    expect(html).toContain('$29.99/month')
    expect(html).toContain(
      '1 included premium event credit per billing period'
    )
    expect(html).toContain(
      '2 included Circle Social credits per billing period'
    )
    expect(html).toContain(ELITE_CIRCLE_SOCIALS_INCLUDED_COPY)
    expect(html).toContain('2 included premium event credits per billing period')
    expect(html).not.toMatch(/Free Circle Socials/)
  })
})
