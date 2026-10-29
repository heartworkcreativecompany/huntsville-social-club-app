import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CIRCLE_BENEFIT_PACKAGES,
  LEGACY_STRIPE_PRICE_PACKAGES,
  NEW_PURCHASE_OFFERS_ACTIVE,
  NEW_PURCHASE_STRIPE_PRICE_IDS,
  PROPOSED_NEW_PURCHASE_PRICE_PARAMS,
  activeCheckoutPriceIdForTier,
  circleBenefitPackageFromPriceId,
  entitlementCycleActionForStripePrice,
  grantsForBenefitPackage,
  legacyBenefitPackageForTier,
} from '@/lib/circle-benefit-packages'
import {
  consumeGuestInvite,
  returnGuestInvite,
  shouldRetainActiveEntitlementCycle,
  startEntitlementCycle,
} from '@/lib/membership-billing-cycles'
import { openCircleCycleForStripePrice } from '@/lib/stripe/circle-fulfillment'
import {
  buildMemberEntitlements,
  evaluateEventRegistration,
  membershipPerkCopyLines,
} from '@/lib/membership-entitlements'
import {
  PRICING_PLANS,
  UNAVAILABLE_CIRCLE_ENTITLEMENT_COPY,
  preparedNewPurchaseMembershipCopy,
} from '@/lib/membership-pricing-copy'
import {
  STRIPE_LIVE_PRICE_IDS,
  STRIPE_LIVE_PRODUCT_IDS,
  stripePriceIdForTier,
} from '@/lib/stripe/config'
import {
  ELITE_CIRCLE_GUEST_INVITES_PER_PERIOD,
  ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD,
  INNER_CIRCLE_CIRCLE_SOCIAL_CREDITS_PER_PERIOD,
  INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD,
} from '@/lib/membership-tier-config'
import type { EntitlementCycle } from '@/lib/membership-entitlements'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => null,
}))

const FUTURE_INNER = 'future-inner-price-slot'
const FUTURE_ELITE = 'future-elite-price-slot'
const futurePrices = {
  [FUTURE_INNER]: 'inner_new' as const,
  [FUTURE_ELITE]: 'elite_new' as const,
}

function cycle(partial: Partial<EntitlementCycle> & Pick<EntitlementCycle, 'product_tier'>): EntitlementCycle {
  return {
    id: 'cycle-1',
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

function billing(tier: 'member' | 'inner_circle' | 'elite_circle', priceId: string | null = null) {
  return {
    tier,
    plan: 'monthly' as const,
    subscription_status: tier === 'member' ? ('none' as const) : ('active' as const),
    renewal_at: null,
    cancelled_at: null,
    plan_change_pending: null,
    payment_failure: { active: false, since: null, reminder_sent_at: null },
    billing_period_start: null,
    billing_period_end: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    stripe_price_id: priceId,
  }
}

describe('versioned Circle benefit packages', () => {
  it('maps the live legacy prices and the new purchase prices', () => {
    expect(circleBenefitPackageFromPriceId(STRIPE_LIVE_PRICE_IDS.inner_circle)).toBe(
      'inner_legacy'
    )
    expect(circleBenefitPackageFromPriceId(STRIPE_LIVE_PRICE_IDS.elite_circle)).toBe(
      'elite_legacy'
    )
    expect(NEW_PURCHASE_STRIPE_PRICE_IDS.inner_circle).toBe(
      'price_1UVhbLBei7W40myBUHWYhB73'
    )
    expect(NEW_PURCHASE_STRIPE_PRICE_IDS.elite_circle).toBe(
      'price_1UVhbmBei7W40myBlYFYFFZy'
    )
    expect(circleBenefitPackageFromPriceId(NEW_PURCHASE_STRIPE_PRICE_IDS.inner_circle)).toBe(
      'inner_new'
    )
    expect(circleBenefitPackageFromPriceId(NEW_PURCHASE_STRIPE_PRICE_IDS.elite_circle)).toBe(
      'elite_new'
    )
    expect(NEW_PURCHASE_OFFERS_ACTIVE).toBe(true)
    expect(
      activeCheckoutPriceIdForTier('inner_circle', stripePriceIdForTier('inner_circle'))
    ).toBe(NEW_PURCHASE_STRIPE_PRICE_IDS.inner_circle)
    expect(
      activeCheckoutPriceIdForTier('elite_circle', stripePriceIdForTier('elite_circle'))
    ).toBe(NEW_PURCHASE_STRIPE_PRICE_IDS.elite_circle)
    expect(stripePriceIdForTier('inner_circle')).toBe(STRIPE_LIVE_PRICE_IDS.inner_circle)
    expect(stripePriceIdForTier('elite_circle')).toBe(STRIPE_LIVE_PRICE_IDS.elite_circle)
    expect(LEGACY_STRIPE_PRICE_PACKAGES[STRIPE_LIVE_PRICE_IDS.inner_circle]).toBe(
      'inner_legacy'
    )
    expect(LEGACY_STRIPE_PRICE_PACKAGES[STRIPE_LIVE_PRICE_IDS.elite_circle]).toBe(
      'elite_legacy'
    )
    expect(
      entitlementCycleActionForStripePrice(STRIPE_LIVE_PRICE_IDS.connect)
    ).toEqual({ action: 'skip', reason: 'not_circle' })
    expect(PROPOSED_NEW_PURCHASE_PRICE_PARAMS.inner_circle.product).toBe(
      STRIPE_LIVE_PRODUCT_IDS.inner_circle
    )
    expect(PROPOSED_NEW_PURCHASE_PRICE_PARAMS.elite_circle.product).toBe(
      STRIPE_LIVE_PRODUCT_IDS.elite_circle
    )
  })

  it('resolves an explicit future mapping without treating an unknown price as a tier', () => {
    expect(
      entitlementCycleActionForStripePrice(FUTURE_INNER, futurePrices)
    ).toEqual({ action: 'start', packageId: 'inner_new' })
    expect(
      entitlementCycleActionForStripePrice(FUTURE_ELITE, futurePrices)
    ).toEqual({ action: 'start', packageId: 'elite_new' })
    expect(entitlementCycleActionForStripePrice('price_unknown')).toEqual({
      action: 'skip',
      reason: 'unmapped_price',
    })
    expect(entitlementCycleActionForStripePrice(null)).toEqual({
      action: 'skip',
      reason: 'missing_price',
    })
    expect(
      entitlementCycleActionForStripePrice(STRIPE_LIVE_PRICE_IDS.connect)
    ).toEqual({ action: 'skip', reason: 'not_circle' })
    expect(circleBenefitPackageFromPriceId('price_unknown')).toBeNull()
  })

  it('keeps legacy grant numbers and defines the new packages', () => {
    expect(grantsForBenefitPackage('inner_legacy')).toMatchObject({
      premiumCredits: INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD,
      circleSocialCredits: INNER_CIRCLE_CIRCLE_SOCIAL_CREDITS_PER_PERIOD,
      guestInvites: 0,
    })
    expect(grantsForBenefitPackage('elite_legacy')).toMatchObject({
      premiumCredits: ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD,
      circleSocialCredits: null,
      guestInvites: ELITE_CIRCLE_GUEST_INVITES_PER_PERIOD,
    })
    expect(CIRCLE_BENEFIT_PACKAGES.inner_new).toMatchObject({
      premiumCredits: 0,
      circleSocialCredits: 0,
      guestInvites: 0,
      priorityRsvp: false,
      businessDirectoryApplication: false,
    })
    expect(CIRCLE_BENEFIT_PACKAGES.elite_new).toMatchObject({
      premiumCredits: 1,
      circleSocialCredits: 2,
      guestInvites: 0,
      priorityRsvp: true,
      businessDirectoryApplication: true,
    })
    expect(legacyBenefitPackageForTier('inner_circle')).toBe('inner_legacy')
    expect(legacyBenefitPackageForTier('elite_circle')).toBe('elite_legacy')
  })

  it('proposes Stripe price parameters without price IDs', () => {
    expect(PROPOSED_NEW_PURCHASE_PRICE_PARAMS.inner_circle.unit_amount).toBe(1599)
    expect(PROPOSED_NEW_PURCHASE_PRICE_PARAMS.elite_circle.unit_amount).toBe(3999)
    expect(PROPOSED_NEW_PURCHASE_PRICE_PARAMS.inner_circle.recurring.interval).toBe(
      'month'
    )
    expect(JSON.stringify(PROPOSED_NEW_PURCHASE_PRICE_PARAMS)).not.toMatch(
      /price_[A-Za-z0-9]+/
    )
  })

  it('publishes the new offer wording and keeps friendship behind its flag', () => {
    expect(PRICING_PLANS.inner_circle.price).toBe('$15.99/month')
    expect(PRICING_PLANS.elite_circle.price).toBe('$39.99/month')
    const pricingPage = readFileSync(
      join(process.cwd(), 'components/membership/pricing-page-content.tsx'),
      'utf8'
    )
    expect(pricingPage).toContain('preparedNewPurchaseMembershipCopy')
    expect(pricingPage).toContain('isFriendshipMatchingEnabled')

    const hidden = preparedNewPurchaseMembershipCopy({
      friendshipMatchingEnabled: false,
    })
    expect(hidden.active).toBe(true)
    expect(hidden.inner.price).toBe('$15.99/month')
    expect(hidden.inner.bullets.join(' ')).not.toMatch(/friendship/i)
    expect(hidden.elite.bullets).toContain('2 Circle Social credits per billing cycle.')
    expect(hidden.elite.bullets).toContain('No guest invitations.')
    expect(hidden.messaging).toMatch(/does not grant or withhold/i)

    const withFriendship = preparedNewPurchaseMembershipCopy({
      friendshipMatchingEnabled: true,
    })
    expect(withFriendship.inner.bullets.join(' ')).toMatch(/friendship/i)
  })
})

describe('new and legacy event fulfillment', () => {
  it('sends a new Inner Circle member to pay-per-event when grants are zero', () => {
    const entitlements = buildMemberEntitlements({
      applicationApproved: true,
      billing: billing('inner_circle'),
      activeCycle: cycle({
        product_tier: 'inner_circle',
        credits_granted: 0,
        circle_social_credits_granted: 0,
      }),
    })
    expect(entitlements.premiumCreditsRemaining).toBe(0)
    expect(entitlements.circleSocialCreditsRemaining).toBe(0)
    expect(entitlements.guestInvitesRemaining).toBe(0)
    for (const eventType of ['circle_social', 'premium_event'] as const) {
      const decision = evaluateEventRegistration({
        entitlements,
        eventType,
        eventStatus: 'published',
        isGoingRsvp: true,
      })
      expect(decision.allowed).toBe(true)
      if (decision.allowed) expect(decision.method).toBe('paid_per_event')
    }
  })

  it('requires payment for a new Elite third Circle Social and second premium event', () => {
    const socialExhausted = buildMemberEntitlements({
      applicationApproved: true,
      billing: billing('elite_circle'),
      activeCycle: cycle({
        product_tier: 'elite_circle',
        credits_granted: 1,
        credits_used: 0,
        circle_social_credits_granted: 2,
        circle_social_credits_used: 2,
      }),
    })
    const social = evaluateEventRegistration({
      entitlements: socialExhausted,
      eventType: 'circle_social',
      eventStatus: 'published',
      isGoingRsvp: true,
    })
    expect(social.allowed).toBe(true)
    if (social.allowed) expect(social.method).toBe('paid_per_event')

    const withSocialCredit = buildMemberEntitlements({
      applicationApproved: true,
      billing: billing('elite_circle'),
      activeCycle: cycle({
        product_tier: 'elite_circle',
        credits_granted: 1,
        circle_social_credits_granted: 2,
        circle_social_credits_used: 1,
      }),
    })
    const useCredit = evaluateEventRegistration({
      entitlements: withSocialCredit,
      eventType: 'circle_social',
      eventStatus: 'published',
      isGoingRsvp: true,
    })
    expect(useCredit.allowed).toBe(true)
    if (useCredit.allowed) {
      expect(useCredit.method).toBe('credit')
      expect(useCredit.creditKind).toBe('circle_social')
    }

    const premiumExhausted = buildMemberEntitlements({
      applicationApproved: true,
      billing: billing('elite_circle'),
      activeCycle: cycle({
        product_tier: 'elite_circle',
        credits_granted: 1,
        credits_used: 1,
        circle_social_credits_granted: 2,
      }),
    })
    const premium = evaluateEventRegistration({
      entitlements: premiumExhausted,
      eventType: 'premium_event',
      eventStatus: 'published',
      isGoingRsvp: true,
    })
    expect(premium.allowed).toBe(true)
    if (premium.allowed) expect(premium.method).toBe('paid_per_event')
  })

  it('keeps a null Circle Social grant unlimited and a null premium grant unmetered', () => {
    const legacyElite = buildMemberEntitlements({
      applicationApproved: true,
      billing: billing('elite_circle', STRIPE_LIVE_PRICE_IDS.elite_circle),
      activeCycle: cycle({
        product_tier: 'elite_circle',
        credits_granted: 2,
        circle_social_credits_granted: null,
        guest_invites_granted: 1,
      }),
    })
    expect(legacyElite.circleSocialCreditsRemaining).toBeNull()
    const social = evaluateEventRegistration({
      entitlements: legacyElite,
      eventType: 'circle_social',
      eventStatus: 'published',
      isGoingRsvp: true,
    })
    expect(social.allowed).toBe(true)
    if (social.allowed) expect(social.method).toBe('included_unlimited')

    const grandfatherPremium = buildMemberEntitlements({
      applicationApproved: true,
      billing: billing('inner_circle', STRIPE_LIVE_PRICE_IDS.inner_circle),
      activeCycle: cycle({
        product_tier: 'inner_circle',
        credits_granted: null,
        circle_social_credits_granted: null,
      }),
    })
    expect(grandfatherPremium.premiumCreditsRemaining).toBeNull()
    const premium = evaluateEventRegistration({
      entitlements: grandfatherPremium,
      eventType: 'premium_event',
      eventStatus: 'published',
      isGoingRsvp: true,
    })
    expect(premium.allowed).toBe(true)
    if (premium.allowed) expect(premium.method).toBe('included_unlimited')
  })

  it('does not guess guest invitations for an unmapped price and keeps complimentary legacy rules', () => {
    const unknown = buildMemberEntitlements({
      applicationApproved: true,
      billing: billing('elite_circle', 'price_unknown'),
      activeCycle: null,
    })
    expect(unknown.guestInvitesRemaining).toBe(0)
    expect(unknown.benefitFulfillment).toBe('unavailable')
    expect(unknown.circleSocialCreditsRemaining).toBe(0)
    expect(unknown.premiumCreditsRemaining).toBe(0)
    const unknownSocial = evaluateEventRegistration({
      entitlements: unknown,
      eventType: 'circle_social',
      eventStatus: 'published',
      isGoingRsvp: true,
    })
    expect(unknownSocial.allowed).toBe(true)
    if (unknownSocial.allowed) {
      expect(unknownSocial.method).toBe('paid_per_event')
      expect(unknownSocial.description).toBe(UNAVAILABLE_CIRCLE_ENTITLEMENT_COPY)
    }
    expect(membershipPerkCopyLines(unknown)).toEqual([
      UNAVAILABLE_CIRCLE_ENTITLEMENT_COPY,
    ])

    const complimentary = buildMemberEntitlements({
      applicationApproved: true,
      billing: billing('member'),
      activeCycle: null,
      accessOverride: {
        tier: 'elite_circle',
        startsAt: '2026-10-01T00:00:00.000Z',
        expiresAt: null,
        revokedAt: null,
      },
    })
    expect(complimentary.productTier).toBe('elite_circle')
    expect(complimentary.benefitFulfillment).toBe('known_package')
    expect(complimentary.guestInvitesRemaining).toBe(1)
    expect(complimentary.circleSocialCreditsRemaining).toBeNull()
    expect(complimentary.canMessage).toBe(true)
  })

  it('reads an already-issued guest invitation from the stored cycle', () => {
    const issued = buildMemberEntitlements({
      applicationApproved: true,
      billing: billing('elite_circle'),
      activeCycle: cycle({
        product_tier: 'elite_circle',
        guest_invites_granted: 1,
        guest_invites_used: 0,
        circle_social_credits_granted: null,
        credits_granted: 2,
      }),
    })
    expect(issued.guestInvitesRemaining).toBe(1)

    const newPackage = buildMemberEntitlements({
      applicationApproved: true,
      billing: billing('elite_circle'),
      activeCycle: cycle({
        product_tier: 'elite_circle',
        credits_granted: 1,
        circle_social_credits_granted: 2,
        guest_invites_granted: 0,
      }),
    })
    expect(newPackage.guestInvitesRemaining).toBe(0)
    const lines = membershipPerkCopyLines(newPackage).join(' ')
    expect(lines).toContain('2 of 2 included Circle Social')
    expect(lines).not.toContain('All Circle Socials are included')
    expect(lines).not.toContain('$39.99')
  })
})

describe('cycle creation and redemption races', () => {
  it('retains the current cycle for a duplicate or older period', () => {
    const existing = cycle({ product_tier: 'inner_circle' })
    expect(
      shouldRetainActiveEntitlementCycle(
        existing,
        new Date('2026-10-01T00:00:00.000Z')
      )
    ).toBe(true)
    expect(
      shouldRetainActiveEntitlementCycle(
        existing,
        new Date('2026-09-01T00:00:00.000Z')
      )
    ).toBe(true)
    expect(
      shouldRetainActiveEntitlementCycle(
        existing,
        new Date('2026-11-01T00:00:00.000Z')
      )
    ).toBe(false)
  })

  it('fulfills the live new prices and keeps a legacy renewal on the legacy package', async () => {
    async function fulfill(priceId: string) {
      let args: Record<string, unknown> | null = null
      const supabase = {
        async rpc(_name: string, payload: Record<string, unknown>) {
          args = payload
          return {
            data: {
              id: 'cycle-live-price',
              product_tier: payload.p_product_tier,
              period_start: payload.p_period_start,
              period_end: payload.p_period_end,
              credits_granted: payload.p_credits_granted,
              credits_used: 0,
              guest_invites_granted: payload.p_guest_invites_granted,
              guest_invites_used: 0,
              circle_social_credits_granted: payload.p_circle_social_credits_granted,
              circle_social_credits_used: 0,
              is_active: true,
            },
            error: null,
          }
        },
      }
      const result = await openCircleCycleForStripePrice(supabase as never, {
        userId: 'user-live-price',
        priceId,
        periodStart: new Date('2026-10-01T00:00:00.000Z'),
        periodEnd: new Date('2026-11-01T00:00:00.000Z'),
      })
      return { result, args }
    }

    const inner = await fulfill(NEW_PURCHASE_STRIPE_PRICE_IDS.inner_circle!)
    expect(inner.result).toMatchObject({ opened: true, packageId: 'inner_new' })
    expect(inner.args).toMatchObject({
      p_credits_granted: 0,
      p_circle_social_credits_granted: 0,
      p_guest_invites_granted: 0,
    })

    const elite = await fulfill(NEW_PURCHASE_STRIPE_PRICE_IDS.elite_circle!)
    expect(elite.result).toMatchObject({ opened: true, packageId: 'elite_new' })
    expect(elite.args).toMatchObject({
      p_credits_granted: 1,
      p_circle_social_credits_granted: 2,
      p_guest_invites_granted: 0,
    })

    const legacy = await fulfill(STRIPE_LIVE_PRICE_IDS.inner_circle)
    expect(legacy.result).toMatchObject({ opened: true, packageId: 'inner_legacy' })
    expect(legacy.args).toMatchObject({
      p_credits_granted: 1,
      p_circle_social_credits_granted: 2,
      p_guest_invites_granted: 0,
    })
  })

  it('does not rewrite stored balances when the same period is started again', async () => {
    const existing = {
      id: 'cycle-existing',
      user_id: 'user-1',
      product_tier: 'inner_circle' as const,
      period_start: '2026-10-01T00:00:00.000Z',
      period_end: '2026-11-01T00:00:00.000Z',
      credits_granted: 1,
      credits_used: 1,
      guest_invites_granted: 0,
      guest_invites_used: 0,
      circle_social_credits_granted: 2,
      circle_social_credits_used: 1,
      is_active: true,
    }
    const writes: unknown[] = []
    const supabase = {
      from() {
        const chain = {
          select() {
            return chain
          },
          eq() {
            return chain
          },
          order() {
            return chain
          },
          limit() {
            return chain
          },
          maybeSingle: async () => ({ data: existing, error: null }),
          update(payload: unknown) {
            writes.push(payload)
            return chain
          },
          insert(payload: unknown) {
            writes.push(payload)
            return chain
          },
          single: async () => ({ data: existing, error: null }),
          then(resolve: (value: unknown) => void) {
            resolve({ data: null, error: null })
          },
        }
        return chain
      },
    }

    const kept = await startEntitlementCycle(supabase as never, {
      userId: 'user-1',
      productTier: 'inner_circle',
      benefitPackage: 'inner_legacy',
      periodStart: new Date('2026-10-01T00:00:00.000Z'),
      periodEnd: new Date('2026-11-01T00:00:00.000Z'),
    })
    expect(kept.credits_used).toBe(1)
    expect(kept.circle_social_credits_used).toBe(1)
    expect(writes).toEqual([])
  })

  it('denies a second guest spend and a repeated return', async () => {
    const state = {
      id: 'cycle-guest',
      guest_invites_granted: 1,
      guest_invites_used: 0,
      is_active: true,
    }
    let reads = 0
    function client() {
      return {
        from() {
          return {
            select() {
              return {
                eq() {
                  return this
                },
                single: async () => {
                  reads += 1
                  const snapshot =
                    reads <= 2
                      ? { ...state, guest_invites_used: 0 }
                      : { ...state }
                  return { data: snapshot, error: null }
                },
              }
            },
            update(values: { guest_invites_used: number }) {
              const filters: Record<string, unknown> = {}
              const chain = {
                eq(column: string, value: unknown) {
                  filters[column] = value
                  return chain
                },
                select() {
                  return {
                    maybeSingle: async () => {
                      if (
                        filters.guest_invites_used != null &&
                        state.guest_invites_used !== filters.guest_invites_used
                      ) {
                        return { data: null, error: null }
                      }
                      state.guest_invites_used = values.guest_invites_used
                      return { data: { ...state }, error: null }
                    },
                  }
                },
              }
              return chain
            },
          }
        },
      }
    }

    const shared = client()
    const [first, second] = await Promise.allSettled([
      consumeGuestInvite(shared as never, state.id),
      consumeGuestInvite(shared as never, state.id),
    ])
    const fulfilled = [first, second].filter((result) => result.status === 'fulfilled')
    const rejected = [first, second].filter((result) => result.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(state.guest_invites_used).toBe(1)
    expect(state.guest_invites_granted).toBe(1)

    await returnGuestInvite(shared as never, state.id)
    expect(state.guest_invites_used).toBe(0)
    await returnGuestInvite(shared as never, state.id)
    expect(state.guest_invites_used).toBe(0)
    expect(state.guest_invites_granted).toBe(1)
  })
})
