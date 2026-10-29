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
  it('offers Inner Circle at $15.99/month with no included credits', () => {
    expect(PRICING_PLANS.inner_circle.price).toBe(INNER_CIRCLE_MONTHLY_PRICE)
    expect(PRICING_PLANS.inner_circle.price).toBe('$15.99/month')
    expect(PRICING_PLANS.elite_circle.price).toBe('$39.99/month')
    expect(PRICING_PLANS.inner_circle.bullets).toContain('No Circle Social credits.')
    expect(PRICING_PLANS.inner_circle.bullets).toContain('No premium-event credits.')
    expect(PRICING_PLANS.inner_circle.bullets).toContain('No guest invitations.')
    expect(PRICING_PLANS.elite_circle.bullets).toContain(
      '2 Circle Social credits per billing cycle.'
    )
    expect(PRICING_PLANS.elite_circle.bullets).toContain(
      '1 premium-event credit per billing cycle.'
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

  it('describes the new Elite offer as metered credits without a guest invitation', () => {
    expect(PRICING_PLANS.elite_circle.bullets).not.toContain(
      ELITE_CIRCLE_SOCIALS_INCLUDED_COPY
    )
    expect(COMPARISON_TABLE.rows.find((row) => row[0] === 'Circle Socials')?.[3]).toBe(
      '2 credits per billing cycle'
    )
    expect(COMPARISON_TABLE.rows.find((row) => row[0] === 'Guest invites')?.[3]).toBe(
      'No'
    )
    expect(allCustomerFacingCopy()).not.toContain(ELITE_CIRCLE_SOCIALS_INCLUDED_COPY)
  })

  it('uses the exhausted Inner Circle Circle Social message', () => {
    expect(INNER_CIRCLE_SOCIAL_CREDITS_EXHAUSTED_MESSAGE).toBe(
      'You have used your 2 included Circle Social credits for this billing period.'
    )
  })
})
