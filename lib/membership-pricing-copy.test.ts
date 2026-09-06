import { describe, expect, it } from 'vitest'
import {
  COMPARISON_TABLE,
  ELITE_CIRCLE_SOCIALS_INCLUDED_COPY,
  INNER_CIRCLE_MONTHLY_PRICE,
  INNER_CIRCLE_SOCIAL_CREDITS_EXHAUSTED_MESSAGE,
  PRICING_FAQ,
  PRICING_PLANS,
  UPGRADE_MODALS,
} from '@/lib/membership-pricing-copy'

function allCustomerFacingCopy(): string {
  return [
    ...PRICING_PLANS.inner_circle.bullets,
    PRICING_PLANS.inner_circle.description,
    ...PRICING_PLANS.elite_circle.bullets,
    COMPARISON_TABLE.rows.map((row) => row.join(' ')).join('\n'),
    COMPARISON_TABLE.footnote,
    ...PRICING_FAQ.map((item) => `${item.question} ${item.answer}`),
    UPGRADE_MODALS.free_to_inner.body,
    ...UPGRADE_MODALS.free_to_inner.bullets,
    ...UPGRADE_MODALS.free_to_elite.bullets,
    ...UPGRADE_MODALS.inner_to_elite.bullets,
  ].join('\n')
}

describe('membership pricing copy — Circle Social entitlements', () => {
  it('keeps Inner Circle at $29.99/month with 1 premium and 2 Circle Social credits', () => {
    expect(PRICING_PLANS.inner_circle.price).toBe(INNER_CIRCLE_MONTHLY_PRICE)
    expect(PRICING_PLANS.inner_circle.price).toBe('$29.99/month')
    expect(PRICING_PLANS.inner_circle.bullets).toContain(
      '1 included premium event credit per billing period'
    )
    expect(PRICING_PLANS.inner_circle.bullets).toContain(
      '2 included Circle Social credits per billing period'
    )
  })

  it('does not claim unlimited Circle Social access for Inner Circle', () => {
    const innerCopy = [
      ...PRICING_PLANS.inner_circle.bullets,
      PRICING_PLANS.inner_circle.description,
      COMPARISON_TABLE.rows.map((row) => row[3]).join('\n'),
      UPGRADE_MODALS.free_to_inner.body,
      ...UPGRADE_MODALS.free_to_inner.bullets,
    ].join('\n')

    expect(innerCopy).not.toMatch(/unlimited Circle Social/i)
    expect(innerCopy).not.toMatch(/all Circle Socials included/i)
    expect(innerCopy).not.toMatch(/Free Circle Socials/i)
    expect(innerCopy).not.toMatch(/Attend Circle Socials at no additional cost/i)
  })

  it('adds the exact Elite Circle Socials included sentence', () => {
    expect(PRICING_PLANS.elite_circle.bullets).toContain(
      ELITE_CIRCLE_SOCIALS_INCLUDED_COPY
    )
    expect(PRICING_PLANS.elite_circle.bullets).toContain(
      '2 included premium event credits per billing period'
    )
    expect(COMPARISON_TABLE.rows.find((row) => row[0] === 'Circle Socials')?.[4]).toBe(
      ELITE_CIRCLE_SOCIALS_INCLUDED_COPY
    )
    expect(allCustomerFacingCopy()).toContain(ELITE_CIRCLE_SOCIALS_INCLUDED_COPY)
  })

  it('uses the exhausted Inner Circle Circle Social message', () => {
    expect(INNER_CIRCLE_SOCIAL_CREDITS_EXHAUSTED_MESSAGE).toBe(
      'You have used your 2 included Circle Social credits for this billing period.'
    )
  })
})
