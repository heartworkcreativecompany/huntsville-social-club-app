import { describe, expect, it } from 'vitest'
import {
  buildMemberEntitlements,
  evaluateEventRegistration,
  evaluatePriorityRsvpWindow,
  membershipPerkCopyLines,
} from '@/lib/membership-entitlements'
import {
  ELITE_CIRCLE_SOCIALS_INCLUDED_COPY,
  INNER_CIRCLE_SOCIAL_CREDITS_EXHAUSTED_MESSAGE,
  innerCircleSocialRemainingHeadline,
  innerIncludedRemainingHeadline,
} from '@/lib/membership-pricing-copy'
import {
  INNER_CIRCLE_CIRCLE_SOCIAL_CREDITS_PER_PERIOD,
  INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD,
} from '@/lib/membership-tier-config'

function entitlementsFor(
  tier: 'member' | 'inner_circle' | 'elite_circle',
  creditsRemaining = 0,
  circleSocialRemaining?: number | null
) {
  const circleGranted =
    tier !== 'inner_circle' || circleSocialRemaining === null ? null : 2
  const circleUsed =
    typeof circleSocialRemaining === 'number' ? 2 - circleSocialRemaining : 0
  const cycle =
    tier === 'member'
      ? null
      : {
          id: 'cycle-1',
          product_tier: tier,
          period_start: new Date().toISOString(),
          period_end: new Date(Date.now() + 86400000).toISOString(),
          credits_granted: tier === 'inner_circle' ? 1 : 2,
          credits_used: (tier === 'inner_circle' ? 1 : 2) - creditsRemaining,
          guest_invites_granted: tier === 'elite_circle' ? 1 : 0,
          guest_invites_used: 0,
          circle_social_credits_granted: circleGranted,
          circle_social_credits_used: circleUsed,
          is_active: true,
        }

  return buildMemberEntitlements({
    applicationApproved: true,
    billing: {
      tier,
      plan: 'monthly',
      subscription_status: tier === 'member' ? 'none' : 'active',
      renewal_at: null,
      cancelled_at: null,
      plan_change_pending: null,
      payment_failure: { active: false, since: null, reminder_sent_at: null },
      billing_period_start: null,
      billing_period_end: null,
      stripe_customer_id: null,
      stripe_subscription_id: null,
    },
    activeCycle: cycle,
  })
}

describe('membership event rules', () => {
  it('makes standard events free for all members', () => {
    const decision = evaluateEventRegistration({
      entitlements: entitlementsFor('member'),
      eventType: 'standard_event',
      eventStatus: 'published',
      isGoingRsvp: true,
    })
    expect(decision.allowed).toBe(true)
    if (decision.allowed) {
      expect(decision.method).toBe('included_unlimited')
      expect(decision.paymentRequired).toBeFalsy()
    }
  })

  it('lets free members pay for Circle Socials instead of blocking', () => {
    const decision = evaluateEventRegistration({
      entitlements: entitlementsFor('member'),
      eventType: 'circle_social',
      eventStatus: 'published',
      isGoingRsvp: true,
    })
    expect(decision.allowed).toBe(true)
    if (decision.allowed) {
      expect(decision.method).toBe('paid_per_event')
    }
  })

  it('uses premium credits for Inner on premium events', () => {
    const decision = evaluateEventRegistration({
      entitlements: entitlementsFor('inner_circle', 1),
      eventType: 'premium_event',
      eventStatus: 'published',
      isGoingRsvp: true,
    })
    expect(decision.allowed).toBe(true)
    if (decision.allowed) {
      expect(decision.method).toBe('credit')
      expect(decision.freeRegistrationsRemaining).toBe(1)
    }
  })

  it('enforces Elite priority RSVP window', () => {
    const general = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const blocked = evaluatePriorityRsvpWindow({
      entitlements: entitlementsFor('inner_circle', 1),
      eventType: 'premium_event',
      generalRsvpOpensAt: general,
    })
    expect(blocked?.allowed).toBe(false)

    const eliteOk = evaluatePriorityRsvpWindow({
      entitlements: entitlementsFor('elite_circle', 2),
      eventType: 'premium_event',
      generalRsvpOpensAt: general,
    })
    expect(eliteOk).toBeNull()
  })

  it('gates Business Directory apply to Elite only', () => {
    expect(entitlementsFor('member').canApplyBusinessListing).toBe(false)
    expect(entitlementsFor('inner_circle', 1).canApplyBusinessListing).toBe(false)
    expect(entitlementsFor('elite_circle', 2).canApplyBusinessListing).toBe(true)
    expect(entitlementsFor('member').canBrowseBusinessDirectory).toBe(true)
  })
})

describe('Inner Circle Circle Social credits', () => {
  it('grants 1 premium event credit and 2 Circle Social credits', () => {
    const entitlements = entitlementsFor('inner_circle', 1, 2)
    expect(entitlements.premiumCreditsRemaining).toBe(1)
    expect(entitlements.circleSocialCreditsRemaining).toBe(2)
    expect(INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD).toBe(1)
    expect(INNER_CIRCLE_CIRCLE_SOCIAL_CREDITS_PER_PERIOD).toBe(2)
  })

  it('allows two included Circle Social RSVPs then denies the third', () => {
    const first = evaluateEventRegistration({
      entitlements: entitlementsFor('inner_circle', 1, 2),
      eventType: 'circle_social',
      eventStatus: 'published',
      isGoingRsvp: true,
    })
    expect(first.allowed).toBe(true)
    if (first.allowed) {
      expect(first.method).toBe('credit')
      expect(first.creditKind).toBe('circle_social')
      expect(first.freeRegistrationsRemaining).toBe(2)
    }

    const second = evaluateEventRegistration({
      entitlements: entitlementsFor('inner_circle', 1, 1),
      eventType: 'circle_social',
      eventStatus: 'published',
      isGoingRsvp: true,
    })
    expect(second.allowed).toBe(true)
    if (second.allowed) {
      expect(second.freeRegistrationsRemaining).toBe(1)
    }

    const third = evaluateEventRegistration({
      entitlements: entitlementsFor('inner_circle', 1, 0),
      eventType: 'circle_social',
      eventStatus: 'published',
      isGoingRsvp: true,
    })
    expect(third.allowed).toBe(false)
    if (!third.allowed) {
      expect(third.code).toBe('included_credits_exhausted')
      expect(third.message).toBe(INNER_CIRCLE_SOCIAL_CREDITS_EXHAUSTED_MESSAGE)
    }
  })

  it('ignores client-supplied remaining counts and uses server entitlements', () => {
    const decision = evaluateEventRegistration({
      entitlements: entitlementsFor('inner_circle', 1, 0),
      eventType: 'circle_social',
      eventStatus: 'published',
      isGoingRsvp: true,
      registrationPreference: 'included',
    })
    expect(decision.allowed).toBe(false)
  })

  it('does not consume Circle Social credits for maybe / not going', () => {
    const decision = evaluateEventRegistration({
      entitlements: entitlementsFor('inner_circle', 1, 2),
      eventType: 'circle_social',
      eventStatus: 'published',
      isGoingRsvp: false,
    })
    expect(decision.allowed).toBe(true)
    if (decision.allowed) {
      expect(decision.method).toBe('included_unlimited')
    }
  })

  it('keeps grandfathered Inner Circle cycles unmetered when granted is null', () => {
    const entitlements = entitlementsFor('inner_circle', 1, null)
    expect(entitlements.circleSocialCreditsRemaining).toBeNull()
    const decision = evaluateEventRegistration({
      entitlements,
      eventType: 'circle_social',
      eventStatus: 'published',
      isGoingRsvp: true,
    })
    expect(decision.allowed).toBe(true)
    if (decision.allowed) {
      expect(decision.method).toBe('included_unlimited')
      expect(decision.creditKind).toBeUndefined()
    }
  })

  it('leaves premium-event credit behavior unchanged', () => {
    const remaining = evaluateEventRegistration({
      entitlements: entitlementsFor('inner_circle', 1, 0),
      eventType: 'premium_event',
      eventStatus: 'published',
      isGoingRsvp: true,
    })
    expect(remaining.allowed).toBe(true)
    if (remaining.allowed) {
      expect(remaining.method).toBe('credit')
      expect(remaining.creditKind).toBe('premium_event')
      expect(remaining.freeRegistrationsRemaining).toBe(1)
    }

    const exhausted = evaluateEventRegistration({
      entitlements: entitlementsFor('inner_circle', 0, 2),
      eventType: 'premium_event',
      eventStatus: 'published',
      isGoingRsvp: true,
    })
    expect(exhausted.allowed).toBe(true)
    if (exhausted.allowed) {
      expect(exhausted.method).toBe('paid_per_event')
    }
  })
})

describe('Elite Circle Circle Socials', () => {
  it('includes Circle Socials without a numeric credit counter', () => {
    const entitlements = entitlementsFor('elite_circle', 2)
    expect(entitlements.circleSocialCreditsRemaining).toBeNull()
    const decision = evaluateEventRegistration({
      entitlements,
      eventType: 'circle_social',
      eventStatus: 'published',
      isGoingRsvp: true,
    })
    expect(decision.allowed).toBe(true)
    if (decision.allowed) {
      expect(decision.method).toBe('included_unlimited')
      expect(decision.description).toBe(ELITE_CIRCLE_SOCIALS_INCLUDED_COPY)
    }
    expect(membershipPerkCopyLines(entitlements)).toContain(
      ELITE_CIRCLE_SOCIALS_INCLUDED_COPY
    )
    expect(membershipPerkCopyLines(entitlements).join(' ')).not.toMatch(
      /Circle Social credit/i
    )
  })
})

describe('member-facing credit copy', () => {
  it('uses remaining-based Inner Circle counters', () => {
    expect(innerIncludedRemainingHeadline(1)).toBe(
      'You have 1 of 1 included premium event credit remaining this billing period.'
    )
    expect(innerIncludedRemainingHeadline(0)).toBe(
      'You have 0 of 1 included premium event credits remaining this billing period.'
    )
    expect(innerCircleSocialRemainingHeadline(2)).toBe(
      'You have 2 of 2 included Circle Social credits remaining this billing period.'
    )
    expect(innerCircleSocialRemainingHeadline(1)).toBe(
      'You have 1 of 2 included Circle Social credit remaining this billing period.'
    )
    expect(innerCircleSocialRemainingHeadline(0)).toBe(
      'You have 0 of 2 included Circle Social credits remaining this billing period.'
    )
  })

  it('shows both Inner Circle counters from entitlements', () => {
    const lines = membershipPerkCopyLines(entitlementsFor('inner_circle', 1, 2))
    expect(lines).toEqual([
      'You have 1 of 1 included premium event credit remaining this billing period.',
      'You have 2 of 2 included Circle Social credits remaining this billing period.',
    ])
  })
})
