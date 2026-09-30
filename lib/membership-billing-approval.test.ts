import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildDirectoryMember,
  directoryCardBadges,
  profilePageBadges,
} from '@/lib/members-discovery'
import {
  hasPreservablePaidMembershipBilling,
  membershipBillingForApproval,
  parseMembershipBilling,
  type MembershipBilling,
} from '@/lib/membership-systems'
import { visiblePublicBadgeLabels } from '@/lib/public-member-badges'
import { STRIPE_LIVE_PRICE_IDS } from '@/lib/stripe/config'

const PERIOD_START = '2026-09-30T01:21:18.000Z'
const PERIOD_END = '2026-10-30T01:21:18.000Z'

function paidBilling(
  overrides: Record<string, unknown> = {}
): MembershipBilling {
  return parseMembershipBilling({
    tier: 'elite_circle',
    subscription_status: 'active',
    plan: 'monthly',
    stripe_customer_id: 'cus_paidmember',
    stripe_subscription_id: 'sub_paidmember',
    stripe_price_id: STRIPE_LIVE_PRICE_IDS.elite_circle,
    billing_period_start: PERIOD_START,
    billing_period_end: PERIOD_END,
    renewal_at: PERIOD_END,
    ...overrides,
  })
}

function expectPaidFieldsPreserved(billing: MembershipBilling) {
  const next = membershipBillingForApproval(billing)
  expect(next).toBe(billing)
  expect(next).toMatchObject({
    tier: billing.tier,
    subscription_status: billing.subscription_status,
    stripe_customer_id: billing.stripe_customer_id,
    stripe_subscription_id: billing.stripe_subscription_id,
    stripe_price_id: billing.stripe_price_id,
    plan: billing.plan,
    billing_period_start: billing.billing_period_start,
    billing_period_end: billing.billing_period_end,
  })
  expect(next.tier).not.toBe('member')
  expect(next.subscription_status).not.toBe('none')
}

describe('membership billing on application approval', () => {
  it('preserves an active Elite subscription on re-approval', () => {
    const billing = paidBilling()
    expectPaidFieldsPreserved(billing)
    expect(membershipBillingForApproval(billing).tier).toBe('elite_circle')
    expect(membershipBillingForApproval(billing).subscription_status).toBe(
      'active'
    )
  })

  it('preserves an active Inner Circle subscription on re-approval', () => {
    expectPaidFieldsPreserved(
      paidBilling({
        tier: 'inner_circle',
        stripe_customer_id: 'cus_inner',
        stripe_subscription_id: 'sub_inner',
        stripe_price_id: STRIPE_LIVE_PRICE_IDS.inner_circle,
      })
    )
  })

  it('preserves an active Connect subscription on re-approval', () => {
    expectPaidFieldsPreserved(
      paidBilling({
        tier: 'connect',
        stripe_customer_id: 'cus_connect',
        stripe_subscription_id: 'sub_connect',
        stripe_price_id: STRIPE_LIVE_PRICE_IDS.connect,
      })
    )
  })

  it('preserves grace-period paid billing on re-approval', () => {
    expectPaidFieldsPreserved(
      paidBilling({
        subscription_status: 'grace',
        stripe_subscription_id: 'sub_grace',
      })
    )
  })

  it('preserves past-due paid billing on re-approval', () => {
    expectPaidFieldsPreserved(
      paidBilling({
        subscription_status: 'past_due',
        stripe_subscription_id: 'sub_pastdue',
      })
    )
  })

  it('does not grant a paid tier when approving someone with no paid state', () => {
    const unpaid = parseMembershipBilling({
      tier: 'applicant',
      subscription_status: 'none',
    })
    const next = membershipBillingForApproval(unpaid)
    expect(next.tier).toBe('member')
    expect(next.subscription_status).toBe('none')
    expect(next.tier).not.toBe('elite_circle')
    expect(next.tier).not.toBe('inner_circle')
    expect(next.tier).not.toBe('connect')
    expect(next.stripe_subscription_id).toBeNull()
  })

  it('does not treat a clobbered status-none Elite price as valid paid billing', () => {
    const damaged = paidBilling({
      tier: 'member',
      subscription_status: 'none',
      stripe_subscription_id: 'sub_1ULCCyBei7W40myBN0AMZbDW',
      stripe_price_id: STRIPE_LIVE_PRICE_IDS.elite_circle,
    })
    expect(hasPreservablePaidMembershipBilling(damaged)).toBe(false)
    const next = membershipBillingForApproval(damaged)
    expect(next.tier).toBe('member')
    expect(next.subscription_status).toBe('none')
    expect(next.tier).not.toBe('elite_circle')
  })

  it('does not preserve an active status that has no subscription id and no paid tier', () => {
    const incomplete = paidBilling({
      tier: 'member',
      subscription_status: 'active',
      stripe_subscription_id: null,
      stripe_price_id: null,
      plan: null,
    })
    expect(hasPreservablePaidMembershipBilling(incomplete)).toBe(false)
    expect(membershipBillingForApproval(incomplete).subscription_status).toBe(
      'none'
    )
    expect(membershipBillingForApproval(incomplete).tier).toBe('member')
  })

  it('preserves a payable subscription id even when the tier label is stale', () => {
    const staleLabel = paidBilling({
      tier: 'member',
      subscription_status: 'active',
      stripe_subscription_id: 'sub_stalelabel',
      stripe_price_id: STRIPE_LIVE_PRICE_IDS.connect,
    })
    const next = membershipBillingForApproval(staleLabel)
    expect(next).toBe(staleLabel)
    expect(next.subscription_status).toBe('active')
    expect(next.stripe_subscription_id).toBe('sub_stalelabel')
    expect(next.subscription_status).not.toBe('none')
  })

  it('preserves grace billing from a recognized paid tier without a subscription id', () => {
    const tierOnly = paidBilling({
      tier: 'inner_circle',
      subscription_status: 'grace',
      stripe_subscription_id: null,
      stripe_customer_id: null,
      stripe_price_id: null,
    })
    expect(hasPreservablePaidMembershipBilling(tierOnly)).toBe(true)
    expect(membershipBillingForApproval(tierOnly).tier).toBe('inner_circle')
    expect(membershipBillingForApproval(tierOnly).subscription_status).toBe(
      'grace'
    )
  })

  it('resolves a preserved active Elite billing record to the Elite Circle badge', () => {
    const preserved = membershipBillingForApproval(paidBilling())
    const built = buildDirectoryMember({
      id: 'member-1',
      full_name: 'Alex Rivera',
      role: 'member',
      created_at: null,
      application_status: 'approved',
      membership_billing: preserved,
    })

    expect(built.membership_tier).toBe('elite_circle')
    expect(
      visiblePublicBadgeLabels({
        role: 'member',
        membership_tier: built.membership_tier,
      })
    ).toEqual(['Elite Circle'])
    expect(profilePageBadges(built).map((badge) => badge.label)).toEqual([
      'Elite Circle',
    ])
    expect(directoryCardBadges(built).map((badge) => badge.label)).toEqual([
      'Elite Circle',
    ])
  })

  it('keeps active Elite billing after approval and does not write member or none', () => {
    const billing = paidBilling({
      stripe_customer_id: 'cus_regression',
      stripe_subscription_id: 'sub_regression',
    })
    const next = membershipBillingForApproval(billing)

    expect(hasPreservablePaidMembershipBilling(billing)).toBe(true)
    expect(next.tier).toBe('elite_circle')
    expect(next.subscription_status).toBe('active')
    expect(next.stripe_customer_id).toBe('cus_regression')
    expect(next.stripe_subscription_id).toBe('sub_regression')
    expect(next.stripe_price_id).toBe(STRIPE_LIVE_PRICE_IDS.elite_circle)
    expect(next.plan).toBe('monthly')
    expect(next.billing_period_start).toBe(PERIOD_START)
    expect(next.billing_period_end).toBe(PERIOD_END)
    expect(next.tier).not.toBe('member')
    expect(next.subscription_status).not.toBe('none')
  })

  it('routes approval through the preservation helper instead of a hard reset', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/(club)/admin/applications/actions.ts'),
      'utf8'
    )
    expect(source).toContain('membershipBillingForApproval(billing)')
    expect(source).not.toContain("tier: 'member' as const")
    expect(source).not.toContain("subscription_status: 'none' as const")
  })
})
