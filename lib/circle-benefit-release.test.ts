import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  NEW_PURCHASE_OFFERS_ACTIVE,
  NEW_PURCHASE_STRIPE_PRICE_IDS,
  activeCheckoutPriceIdForTier,
  grantsForBenefitPackage,
} from '@/lib/circle-benefit-packages'
import {
  buildMemberEntitlements,
  evaluateEventRegistration,
  evaluatePriorityRsvpWindow,
  membershipPerkCopyLines,
} from '@/lib/membership-entitlements'
import { membershipPerkLinesFromSnapshot } from '@/lib/event-rsvp-window'
import { membershipBenefitContextLabel } from '@/lib/membership-card-display'
import { membershipPerksSnapshotFromEntitlements } from '@/lib/member-perks-snapshot'
import { dashboardPerkLinesFromSnapshot } from '@/lib/member-perks-store'
import {
  PENDING_CIRCLE_ENTITLEMENT_COPY,
  UNAVAILABLE_CIRCLE_ENTITLEMENT_COPY,
  UNMETERED_PREMIUM_EVENTS_COPY,
} from '@/lib/membership-pricing-copy'
import { STRIPE_LIVE_PRICE_IDS, stripePriceIdForTier } from '@/lib/stripe/config'
import {
  checkoutPaymentSettlesMembership,
  entitlementOpenForInvoiceBillingReason,
} from '@/lib/stripe/circle-fulfillment'
import type { EntitlementCycle } from '@/lib/membership-entitlements'

const repoRoot = join(__dirname, '..')

function cycle(
  partial: Partial<EntitlementCycle> & Pick<EntitlementCycle, 'product_tier'>
): EntitlementCycle {
  return {
    id: 'cycle-release',
    period_start: '2026-10-01T00:00:00.000Z',
    period_end: '2026-11-01T00:00:00.000Z',
    credits_granted: 0,
    credits_used: 0,
    guest_invites_granted: 0,
    guest_invites_used: 0,
    circle_social_credits_granted: 0,
    circle_social_credits_used: 0,
    is_active: true,
    ...partial,
  }
}

function billing(tier: 'member' | 'inner_circle' | 'elite_circle', priceId: string | null) {
  return {
    tier,
    plan: 'monthly' as const,
    subscription_status: tier === 'member' ? ('none' as const) : ('active' as const),
    stripe_price_id: priceId,
  }
}

describe('retained Circle benefits and inactive new-sale copy', () => {
  it('gives priority RSVP and directory applications to both Elite packages only', () => {
    const general = '2026-12-01T18:00:00.000Z'
    const legacy = buildMemberEntitlements({
      applicationApproved: true,
      billing: billing('elite_circle', STRIPE_LIVE_PRICE_IDS.elite_circle),
      activeCycle: cycle({
        product_tier: 'elite_circle',
        credits_granted: grantsForBenefitPackage('elite_legacy').premiumCredits,
        circle_social_credits_granted: null,
        guest_invites_granted: 1,
      }),
    })
    const next = buildMemberEntitlements({
      applicationApproved: true,
      billing: billing('elite_circle', null),
      activeCycle: cycle({
        product_tier: 'elite_circle',
        credits_granted: grantsForBenefitPackage('elite_new').premiumCredits,
        circle_social_credits_granted: 2,
        guest_invites_granted: 0,
      }),
    })
    const inner = buildMemberEntitlements({
      applicationApproved: true,
      billing: billing('inner_circle', null),
      activeCycle: cycle({
        product_tier: 'inner_circle',
        credits_granted: 0,
        circle_social_credits_granted: 0,
        guest_invites_granted: 0,
      }),
    })

    expect(legacy.hasPriorityRsvp).toBe(true)
    expect(legacy.canApplyBusinessListing).toBe(true)
    expect(next.hasPriorityRsvp).toBe(true)
    expect(next.canApplyBusinessListing).toBe(true)
    expect(inner.hasPriorityRsvp).toBe(false)
    expect(inner.canApplyBusinessListing).toBe(false)
    expect(
      evaluatePriorityRsvpWindow({
        entitlements: next,
        eventType: 'circle_social',
        generalRsvpOpensAt: general,
        now: new Date('2026-11-01T00:00:00.000Z'),
      })
    ).toBeNull()
    expect(
      evaluatePriorityRsvpWindow({
        entitlements: inner,
        eventType: 'premium_event',
        generalRsvpOpensAt: general,
        now: new Date('2026-11-01T00:00:00.000Z'),
      })?.allowed
    ).toBe(false)
  })

  it('keeps complimentary Elite access and does not replace a stored null grant with a tier number', () => {
    const complimentary = buildMemberEntitlements({
      applicationApproved: true,
      billing: billing('member', null),
      activeCycle: null,
      accessOverride: {
        tier: 'elite_circle',
        startsAt: '2026-10-01T00:00:00.000Z',
        expiresAt: null,
        revokedAt: null,
      },
    })
    expect(complimentary.productTier).toBe('elite_circle')
    expect(complimentary.guestInvitesRemaining).toBe(1)
    expect(complimentary.hasPriorityRsvp).toBe(true)
    expect(complimentary.canApplyBusinessListing).toBe(true)
    expect(complimentary.canMessage).toBe(true)

    const unlimited = buildMemberEntitlements({
      applicationApproved: true,
      billing: billing('elite_circle', STRIPE_LIVE_PRICE_IDS.elite_circle),
      activeCycle: cycle({
        product_tier: 'elite_circle',
        credits_granted: null,
        credits_used: 0,
        circle_social_credits_granted: null,
        guest_invites_granted: 1,
        guest_invites_used: 0,
      }),
    })
    const lines = membershipPerkCopyLines(unlimited).join(' ')
    expect(lines).toContain(UNMETERED_PREMIUM_EVENTS_COPY)
    expect(lines).toContain('All Circle Socials are included')
    expect(lines).not.toContain('of 2')
    const social = evaluateEventRegistration({
      entitlements: unlimited,
      eventType: 'circle_social',
      eventStatus: 'published',
      isGoingRsvp: true,
    })
    expect(social.allowed).toBe(true)
    if (social.allowed) expect(social.method).toBe('included_unlimited')

    const metered = buildMemberEntitlements({
      applicationApproved: true,
      billing: billing('elite_circle', null),
      activeCycle: cycle({
        product_tier: 'elite_circle',
        credits_granted: 1,
        credits_used: 0,
        circle_social_credits_granted: 2,
        circle_social_credits_used: 0,
        guest_invites_granted: 0,
      }),
    })
    const snapshotLines = membershipPerkLinesFromSnapshot(
      membershipPerksSnapshotFromEntitlements(metered)
    ).join(' ')
    expect(snapshotLines).toContain('of 1')
    expect(snapshotLines).toContain('2 of 2')
    expect(snapshotLines).not.toContain('All Circle Socials are included')
    expect(snapshotLines).not.toContain('guest invite')
  })

  it('checks out the new price IDs and still recognizes legacy prices', () => {
    expect(NEW_PURCHASE_OFFERS_ACTIVE).toBe(true)
    expect(NEW_PURCHASE_STRIPE_PRICE_IDS).toEqual({
      inner_circle: 'price_1UVhbLBei7W40myBUHWYhB73',
      elite_circle: 'price_1UVhbmBei7W40myBlYFYFFZy',
    })
    expect(
      activeCheckoutPriceIdForTier(
        'inner_circle',
        stripePriceIdForTier('inner_circle')
      )
    ).toBe('price_1UVhbLBei7W40myBUHWYhB73')
    expect(
      activeCheckoutPriceIdForTier(
        'elite_circle',
        stripePriceIdForTier('elite_circle')
      )
    ).toBe('price_1UVhbmBei7W40myBlYFYFFZy')
    expect(stripePriceIdForTier('inner_circle')).toBe(STRIPE_LIVE_PRICE_IDS.inner_circle)
    expect(stripePriceIdForTier('elite_circle')).toBe(STRIPE_LIVE_PRICE_IDS.elite_circle)

    const pricing = readFileSync(
      join(repoRoot, 'components/membership/pricing-page-content.tsx'),
      'utf8'
    )
    expect(pricing).toContain('preparedNewPurchaseMembershipCopy')
    expect(pricing).toContain('isFriendshipMatchingEnabled')

    const route = readFileSync(join(repoRoot, 'app/api/stripe/webhook/route.ts'), 'utf8')
    expect(route).toContain('checkoutPaymentSettlesMembership')
    expect(route).toContain('entitlementOpenForInvoiceBillingReason')
    expect(checkoutPaymentSettlesMembership('unpaid')).toBe(false)
    expect(checkoutPaymentSettlesMembership('paid')).toBe(true)
    expect(entitlementOpenForInvoiceBillingReason('subscription_create')).toBe('initial')
    expect(entitlementOpenForInvoiceBillingReason('subscription_cycle')).toBe('renewal')
    expect(entitlementOpenForInvoiceBillingReason('subscription_update')).toBeNull()

    const messaging = readFileSync(join(repoRoot, 'lib/require-messaging.ts'), 'utf8')
    expect(messaging).toContain(
      'Intentional message requests require accepted identity for both members.'
    )
    expect(messaging).not.toContain('circle-benefit-packages')
    const intros = readFileSync(join(repoRoot, 'lib/curated-intro-admin.ts'), 'utf8')
    expect(intros).toContain('STAFF_INTRO_REVIEW_RETIRED')
  })
})

const newPackagePrices = {
  'future-inner-price-slot': 'inner_new' as const,
  'future-elite-price-slot': 'elite_new' as const,
}

function assertUnissuedState(
  entitlements: ReturnType<typeof buildMemberEntitlements>,
  copy: string
) {
  expect(entitlements.premiumCreditsRemaining).toBe(0)
  expect(entitlements.circleSocialCreditsRemaining).toBe(0)
  expect(entitlements.guestInvitesRemaining).toBe(0)
  expect(entitlements.activeCycle).toBeNull()
  const snapshot = membershipPerksSnapshotFromEntitlements(entitlements)
  expect(dashboardPerkLinesFromSnapshot(snapshot)).toEqual([copy])
  expect(membershipPerkLinesFromSnapshot(snapshot)).toEqual([copy])
  expect(membershipPerkCopyLines(entitlements)).toEqual([copy])
  expect(membershipBenefitContextLabel(entitlements)).toBe(copy)
  expect(copy).not.toMatch(/of \d/)
  expect(copy).not.toContain('All Circle Socials are included')
  for (const eventType of ['circle_social', 'premium_event'] as const) {
    const decision = evaluateEventRegistration({
      entitlements,
      eventType,
      eventStatus: 'published',
      isGoingRsvp: true,
    })
    expect(decision.allowed).toBe(true)
    if (decision.allowed) {
      expect(decision.method).toBe('paid_per_event')
      expect(decision.description).toBe(copy)
      expect(decision.method).not.toBe('credit')
    }
  }
}

describe('new-package members without an issued cycle', () => {
  it('shows pending credits before a new Inner or Elite cycle exists', () => {
    for (const [priceId, packageId] of [
      ['future-inner-price-slot', 'inner_new'],
      ['future-elite-price-slot', 'elite_new'],
    ] as const) {
      const entitlements = buildMemberEntitlements({
        applicationApproved: true,
        billing: billing(
          packageId === 'inner_new' ? 'inner_circle' : 'elite_circle',
          priceId
        ),
        activeCycle: null,
        additionalPricePackages: newPackagePrices,
      })
      expect(entitlements.benefitFulfillment).toBe('pending')
      assertUnissuedState(entitlements, PENDING_CIRCLE_ENTITLEMENT_COPY)
    }
  })

  it('keeps a failed fulfillment in the pending state instead of a legacy balance', () => {
    const entitlements = buildMemberEntitlements({
      applicationApproved: true,
      billing: billing('elite_circle', 'future-elite-price-slot'),
      activeCycle: null,
      additionalPricePackages: newPackagePrices,
    })
    expect(entitlements.benefitFulfillment).toBe('pending')
    assertUnissuedState(entitlements, PENDING_CIRCLE_ENTITLEMENT_COPY)
    expect(entitlements.hasPriorityRsvp).toBe(true)
    expect(entitlements.canApplyBusinessListing).toBe(true)
  })

  it('does not inherit legacy balances when the package is unknown or missing', () => {
    const unknown = buildMemberEntitlements({
      applicationApproved: true,
      billing: billing('elite_circle', 'unmapped-price-token'),
      activeCycle: null,
    })
    expect(unknown.benefitFulfillment).toBe('unavailable')
    assertUnissuedState(unknown, UNAVAILABLE_CIRCLE_ENTITLEMENT_COPY)

    const missing = buildMemberEntitlements({
      applicationApproved: true,
      billing: billing('inner_circle', null),
      activeCycle: null,
    })
    expect(missing.benefitFulfillment).toBe('unavailable')
    assertUnissuedState(missing, UNAVAILABLE_CIRCLE_ENTITLEMENT_COPY)
  })

  it('keeps a known legacy price and complimentary access on their package fallback', () => {
    const legacy = buildMemberEntitlements({
      applicationApproved: true,
      billing: billing('elite_circle', STRIPE_LIVE_PRICE_IDS.elite_circle),
      activeCycle: null,
    })
    expect(legacy.benefitFulfillment).toBe('known_package')
    expect(legacy.guestInvitesRemaining).toBe(1)
    expect(legacy.circleSocialCreditsRemaining).toBeNull()
    const legacySocial = evaluateEventRegistration({
      entitlements: legacy,
      eventType: 'circle_social',
      eventStatus: 'published',
      isGoingRsvp: true,
    })
    expect(legacySocial.allowed).toBe(true)
    if (legacySocial.allowed) expect(legacySocial.method).toBe('included_unlimited')
    expect(membershipPerkCopyLines(legacy).join(' ')).toContain(
      'All Circle Socials are included'
    )
    expect(membershipBenefitContextLabel(legacy)).toBe(
      'Existing subscription benefits for this billing period.'
    )

    const complimentary = buildMemberEntitlements({
      applicationApproved: true,
      billing: billing('member', null),
      activeCycle: null,
      accessOverride: {
        tier: 'elite_circle',
        startsAt: '2026-10-01T00:00:00.000Z',
        expiresAt: null,
        revokedAt: null,
      },
    })
    expect(complimentary.benefitFulfillment).toBe('known_package')
    expect(complimentary.guestInvitesRemaining).toBe(1)
    expect(complimentary.circleSocialCreditsRemaining).toBeNull()
    expect(membershipBenefitContextLabel(complimentary)).toContain('Complimentary access')
  })
})
