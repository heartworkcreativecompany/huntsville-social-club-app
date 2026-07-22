import { describe, expect, it } from 'vitest'
import {
  buildMemberEntitlements,
  evaluateEventRegistration,
  evaluatePriorityRsvpWindow,
} from '@/lib/membership-entitlements'

function entitlementsFor(
  tier: 'member' | 'inner_circle' | 'elite_circle',
  creditsRemaining = 0
) {
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
