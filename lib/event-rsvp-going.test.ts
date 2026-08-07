import { describe, expect, it } from 'vitest'
import {
  isGoingRegistrationEligible,
  resolveGoingButtonState,
} from '@/lib/event-rsvp-going'
import {
  buildMemberEntitlements,
  evaluateEventRegistration,
  type EntitlementCycle,
} from '@/lib/membership-entitlements'
import {
  premiumCreditsSummary,
  premiumEventBubbleOrder,
  isElitePriorityWindowActive,
  resolveEventRsvpWindow,
  shouldShowPriorityRsvpBubble,
} from '@/lib/event-rsvp-window'

function entitlementsFor(
  tier: 'member' | 'inner_circle' | 'elite_circle',
  creditsRemaining = 0
) {
  const cycle: EntitlementCycle | null =
    tier === 'member'
      ? null
      : {
          id: 'cycle',
          product_tier: tier,
          period_start: '2026-08-01T00:00:00.000Z',
          period_end: '2026-09-01T00:00:00.000Z',
          credits_granted: tier === 'elite_circle' ? 2 : 1,
          credits_used: Math.max(
            0,
            (tier === 'elite_circle' ? 2 : 1) - creditsRemaining
          ),
          guest_invites_granted: tier === 'elite_circle' ? 1 : 0,
          guest_invites_used: 0,
          is_active: true,
        }

  return buildMemberEntitlements({
    role: 'member',
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
    applicationApproved: true,
    activeCycle: cycle,
  })
}

describe('resolveGoingButtonState', () => {
  it('enables Going when RSVP is open and the member is eligible', () => {
    expect(
      resolveGoingButtonState({
        canRegisterGoing: true,
        currentStatus: null,
      })
    ).toEqual({ goingBlocked: false, disabled: false })
  })

  it('keeps Going enabled when the member is already Going', () => {
    expect(
      resolveGoingButtonState({
        canRegisterGoing: false,
        currentStatus: 'going',
      })
    ).toEqual({ goingBlocked: false, disabled: false })
  })

  it('blocks Going when RSVP is closed or the member is ineligible', () => {
    expect(
      resolveGoingButtonState({
        canRegisterGoing: false,
        currentStatus: null,
      })
    ).toEqual({ goingBlocked: true, disabled: true })
  })

  it('disables Going while a save is pending even if eligible', () => {
    expect(
      resolveGoingButtonState({
        canRegisterGoing: true,
        currentStatus: null,
        isPending: true,
      })
    ).toEqual({ goingBlocked: false, disabled: true })
  })
})

describe('isGoingRegistrationEligible', () => {
  it('treats a missing preview as eligible when not at capacity', () => {
    expect(isGoingRegistrationEligible(null, false)).toBe(true)
  })

  it('marks priority-window blocks as ineligible', () => {
    expect(
      isGoingRegistrationEligible(
        {
          allowed: false,
          code: 'priority_window',
          message: 'Priority RSVP is open for Elite Circle',
        },
        false
      )
    ).toBe(false)
  })
})

describe('Going enabled vs disabled by tier and window', () => {
  const priority = '2026-08-08T18:00:00.000Z'
  const general = '2026-08-10T23:30:00.000Z'

  it('enables Going for Elite during the Elite priority window', () => {
    const now = new Date('2026-08-09T12:00:00.000Z')
    const window = resolveEventRsvpWindow({
      eventType: 'premium_event',
      priorityRsvpOpensAt: priority,
      generalRsvpOpensAt: general,
      now,
    })
    expect(window.code).toBe('elite_priority')
    expect(isElitePriorityWindowActive(window)).toBe(true)

    const preview = evaluateEventRegistration({
      entitlements: entitlementsFor('elite_circle', 2),
      eventType: 'premium_event',
      eventStatus: 'published',
      isGoingRsvp: true,
      priorityRsvpOpensAt: priority,
      generalRsvpOpensAt: general,
      now,
    })
    expect(preview.allowed).toBe(true)
    expect(isGoingRegistrationEligible(preview, false)).toBe(true)
    expect(
      resolveGoingButtonState({
        canRegisterGoing: true,
        currentStatus: null,
      })
    ).toEqual({ goingBlocked: false, disabled: false })
  })

  it('blocks Going for Elite before Priority RSVP opens', () => {
    const now = new Date('2026-08-07T12:00:00.000Z')
    const preview = evaluateEventRegistration({
      entitlements: entitlementsFor('elite_circle', 2),
      eventType: 'premium_event',
      eventStatus: 'published',
      isGoingRsvp: true,
      priorityRsvpOpensAt: priority,
      generalRsvpOpensAt: general,
      now,
    })
    expect(preview.allowed).toBe(false)
    if (!preview.allowed) {
      expect(preview.code).toBe('priority_window')
      expect(preview.message).toContain('opens for Elite Circle at')
    }
  })

  it('enables Going for Inner Circle once the general window is open', () => {
    const now = new Date('2026-08-11T00:00:00.000Z')
    const preview = evaluateEventRegistration({
      entitlements: entitlementsFor('inner_circle', 1),
      eventType: 'premium_event',
      eventStatus: 'published',
      isGoingRsvp: true,
      priorityRsvpOpensAt: priority,
      generalRsvpOpensAt: general,
      now,
    })
    expect(preview.allowed).toBe(true)
    expect(isGoingRegistrationEligible(preview, false)).toBe(true)
  })

  it('enables Going for free members when general RSVP is open (paid path)', () => {
    const now = new Date('2026-08-11T00:00:00.000Z')
    const preview = evaluateEventRegistration({
      entitlements: entitlementsFor('member'),
      eventType: 'premium_event',
      eventStatus: 'published',
      isGoingRsvp: true,
      priorityRsvpOpensAt: priority,
      generalRsvpOpensAt: general,
      now,
    })
    expect(preview.allowed).toBe(true)
    if (preview.allowed) {
      expect(preview.method).toBe('paid_per_event')
    }
    expect(isGoingRegistrationEligible(preview, false)).toBe(true)
  })

  it('blocks Going for Inner Circle during the Elite priority window', () => {
    const now = new Date('2026-08-09T12:00:00.000Z')
    const preview = evaluateEventRegistration({
      entitlements: entitlementsFor('inner_circle', 1),
      eventType: 'premium_event',
      eventStatus: 'published',
      isGoingRsvp: true,
      priorityRsvpOpensAt: priority,
      generalRsvpOpensAt: general,
      now,
    })
    expect(preview.allowed).toBe(false)
    if (!preview.allowed) {
      expect(preview.code).toBe('priority_window')
    }
    expect(isGoingRegistrationEligible(preview, false)).toBe(false)
    expect(
      resolveGoingButtonState({
        canRegisterGoing: false,
        currentStatus: null,
      })
    ).toEqual({ goingBlocked: true, disabled: true })
  })
})

describe('premium event layout helpers', () => {
  it('shows Priority bubble while waiting on or during Elite priority', () => {
    const waiting = resolveEventRsvpWindow({
      eventType: 'premium_event',
      priorityRsvpOpensAt: '2026-08-08T18:00:00.000Z',
      generalRsvpOpensAt: '2026-08-10T23:30:00.000Z',
      now: new Date('2026-08-07T12:00:00.000Z'),
    })
    expect(waiting.code).toBe('before_priority')
    expect(waiting.showPriorityBubble).toBe(true)
    expect(shouldShowPriorityRsvpBubble(waiting)).toBe(true)
    expect(isElitePriorityWindowActive(waiting)).toBe(false)

    const active = resolveEventRsvpWindow({
      eventType: 'premium_event',
      priorityRsvpOpensAt: '2026-08-08T18:00:00.000Z',
      generalRsvpOpensAt: '2026-08-10T23:30:00.000Z',
      now: new Date('2026-08-09T12:00:00.000Z'),
    })
    expect(active.code).toBe('elite_priority')
    expect(active.isElitePriorityActive).toBe(true)
    expect(shouldShowPriorityRsvpBubble(active)).toBe(true)
    expect(isElitePriorityWindowActive(active)).toBe(true)

    const after = resolveEventRsvpWindow({
      eventType: 'premium_event',
      priorityRsvpOpensAt: '2026-08-08T18:00:00.000Z',
      generalRsvpOpensAt: '2026-08-10T23:30:00.000Z',
      now: new Date('2026-08-11T00:00:00.000Z'),
    })
    expect(after.code).toBe('general')
    expect(shouldShowPriorityRsvpBubble(after)).toBe(false)
    expect(isElitePriorityWindowActive(after)).toBe(false)
  })

  it('orders bubbles as Priority → RSVP → Perks when priority window applies', () => {
    const window = resolveEventRsvpWindow({
      eventType: 'premium_event',
      priorityRsvpOpensAt: '2026-08-08T18:00:00.000Z',
      generalRsvpOpensAt: '2026-08-10T23:30:00.000Z',
      now: new Date('2026-08-09T12:00:00.000Z'),
    })

    expect(
      premiumEventBubbleOrder({
        window,
        showMembershipPerks: true,
      })
    ).toEqual(['priority', 'rsvp', 'perks'])
  })

  it('keeps Priority bubble while waiting for priority to open', () => {
    const window = resolveEventRsvpWindow({
      eventType: 'premium_event',
      priorityRsvpOpensAt: '2026-08-08T18:00:00.000Z',
      generalRsvpOpensAt: '2026-08-10T23:30:00.000Z',
      now: new Date('2026-08-07T12:00:00.000Z'),
    })

    expect(
      premiumEventBubbleOrder({
        window,
        showMembershipPerks: true,
      })
    ).toEqual(['priority', 'rsvp', 'perks'])
  })

  it('omits Priority bubble once general RSVP is open', () => {
    const window = resolveEventRsvpWindow({
      eventType: 'premium_event',
      priorityRsvpOpensAt: '2026-08-08T18:00:00.000Z',
      generalRsvpOpensAt: '2026-08-10T23:30:00.000Z',
      now: new Date('2026-08-11T00:00:00.000Z'),
    })

    expect(
      premiumEventBubbleOrder({
        window,
        showMembershipPerks: true,
      })
    ).toEqual(['rsvp', 'perks'])
  })

  it('shows membership perks copy for paid members only', () => {
    expect(
      premiumCreditsSummary({
        productTier: 'member',
        premiumCreditsRemaining: 0,
        guestInvitesRemaining: 0,
        creditsGranted: null,
      })
    ).toBeNull()

    expect(
      premiumCreditsSummary({
        productTier: 'elite_circle',
        premiumCreditsRemaining: 2,
        guestInvitesRemaining: 1,
        creditsGranted: 2,
      })
    ).toContain('guest invite(s) remaining')

    expect(
      premiumEventBubbleOrder({
        window: resolveEventRsvpWindow({
          eventType: 'premium_event',
          generalRsvpOpensAt: null,
        }),
        showMembershipPerks: false,
      })
    ).toEqual(['rsvp'])
  })
})
