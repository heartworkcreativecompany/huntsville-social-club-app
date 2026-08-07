import { describe, expect, it } from 'vitest'
import {
  applyRsvpPerksSnapshot,
  formatCountdownRemaining,
  membershipPerksSummaryFromSnapshot,
  premiumCreditsSummary,
  resolveEventAccessMembershipCta,
  resolveEventRsvpWindow,
  type MembershipPerksSnapshot,
} from '@/lib/event-rsvp-window'

describe('resolveEventRsvpWindow', () => {
  const priority = '2026-08-08T18:00:00.000Z'
  const general = '2026-08-10T23:30:00.000Z'

  it('labels Elite priority window and hides already-opened priority line', () => {
    const window = resolveEventRsvpWindow({
      eventType: 'premium_event',
      priorityRsvpOpensAt: priority,
      generalRsvpOpensAt: general,
      now: new Date('2026-08-09T12:00:00.000Z'),
    })

    expect(window.code).toBe('elite_priority')
    expect(window.phase).toBe('elite_priority')
    expect(window.isElitePriorityActive).toBe(true)
    expect(window.showPriorityBubble).toBe(true)
    expect(window.countdownLabel).toBe('Ends in')
    expect(window.label).toBe('Elite priority RSVP window')
    expect(window.showPriorityOpensLine).toBe(false)
    expect(window.showGeneralOpensLine).toBe(true)
    expect(window.countdownEndsAt).toBe(general)
  })

  it('shows upcoming priority and general lines before priority opens', () => {
    const window = resolveEventRsvpWindow({
      eventType: 'premium_event',
      priorityRsvpOpensAt: priority,
      generalRsvpOpensAt: general,
      now: new Date('2026-08-07T12:00:00.000Z'),
    })

    expect(window.code).toBe('before_priority')
    expect(window.phase).toBe('before_priority')
    expect(window.isElitePriorityActive).toBe(false)
    expect(window.showPriorityBubble).toBe(true)
    expect(window.countdownLabel).toBe('Opens in')
    expect(window.showPriorityOpensLine).toBe(true)
    expect(window.showGeneralOpensLine).toBe(true)
    expect(window.countdownEndsAt).toBe(priority)
  })

  it('uses General RSVP window after general opens', () => {
    const window = resolveEventRsvpWindow({
      eventType: 'premium_event',
      priorityRsvpOpensAt: priority,
      generalRsvpOpensAt: general,
      now: new Date('2026-08-11T00:00:00.000Z'),
    })

    expect(window.code).toBe('general')
    expect(window.phase).toBe('general')
    expect(window.showPriorityBubble).toBe(false)
    expect(window.isElitePriorityActive).toBe(false)
    expect(window.label).toBe('General RSVP window')
    expect(window.showPriorityOpensLine).toBe(false)
    expect(window.showGeneralOpensLine).toBe(false)
    expect(window.countdownEndsAt).toBeNull()
  })
})

describe('resolveEventAccessMembershipCta', () => {
  const elitePriority = resolveEventRsvpWindow({
    eventType: 'premium_event',
    priorityRsvpOpensAt: '2026-08-08T18:00:00.000Z',
    generalRsvpOpensAt: '2026-08-10T23:30:00.000Z',
    now: new Date('2026-08-09T12:00:00.000Z'),
  })

  const generalWindow = resolveEventRsvpWindow({
    eventType: 'premium_event',
    priorityRsvpOpensAt: '2026-08-08T18:00:00.000Z',
    generalRsvpOpensAt: '2026-08-10T23:30:00.000Z',
    now: new Date('2026-08-11T00:00:00.000Z'),
  })

  it('shows View memberships for free members', () => {
    expect(
      resolveEventAccessMembershipCta({
        productTier: 'member',
        window: elitePriority,
        eventType: 'premium_event',
      })
    ).toEqual({
      kind: 'view_memberships',
      label: 'View memberships',
      href: '/upgrade',
    })
  })

  it('shows Elite upgrade CTA for Inner Circle during Elite priority', () => {
    expect(
      resolveEventAccessMembershipCta({
        productTier: 'inner_circle',
        window: elitePriority,
        eventType: 'premium_event',
      })
    ).toEqual({
      kind: 'upgrade_elite_priority',
      label: 'Upgrade to Elite for priority access',
      href: '/upgrade',
    })
  })

  it('hides membership CTAs for Elite during Elite priority', () => {
    expect(
      resolveEventAccessMembershipCta({
        productTier: 'elite_circle',
        window: elitePriority,
        eventType: 'premium_event',
      })
    ).toBeNull()
  })

  it('does not show Inner upgrade CTA once general window is open', () => {
    expect(
      resolveEventAccessMembershipCta({
        productTier: 'inner_circle',
        window: generalWindow,
        eventType: 'premium_event',
      })
    ).toBeNull()
  })

  it('hides membership CTAs on standard events', () => {
    expect(
      resolveEventAccessMembershipCta({
        productTier: 'member',
        window: generalWindow,
        eventType: 'standard_event',
      })
    ).toBeNull()
  })
})

describe('premiumCreditsSummary and countdown', () => {
  it('formats Elite credit and guest invite remaining copy', () => {
    expect(
      premiumCreditsSummary({
        productTier: 'elite_circle',
        premiumCreditsRemaining: 2,
        guestInvitesRemaining: 1,
        creditsGranted: 2,
      })
    ).toBe(
      'You have 2 of 2 premium credits and 1 guest invite(s) remaining this billing period.'
    )
  })

  it('formats a short countdown remaining string', () => {
    const label = formatCountdownRemaining(
      '2026-08-10T12:00:00.000Z',
      new Date('2026-08-10T10:30:15.000Z')
    )
    expect(label).toBe('1h 29m 45s')
  })
})

describe('Membership Perks after RSVP credit changes', () => {
  const eliteFull: MembershipPerksSnapshot = {
    productTier: 'elite_circle',
    premiumCreditsRemaining: 2,
    creditsGranted: 2,
    guestInvitesRemaining: 1,
  }

  it('shows 1 of 2 after Elite Going consumes a credit', () => {
    const afterGoing = applyRsvpPerksSnapshot({
      previous: eliteFull,
      usedCredit: true,
      perks: {
        productTier: 'elite_circle',
        premiumCreditsRemaining: 1,
        creditsGranted: 2,
        guestInvitesRemaining: 1,
      },
    })

    expect(afterGoing.premiumCreditsRemaining).toBe(1)
    expect(membershipPerksSummaryFromSnapshot(afterGoing)).toBe(
      'You have 1 of 2 premium credits and 1 guest invite(s) remaining this billing period.'
    )
  })

  it('does not refund credits when changing Going → Not going', () => {
    const afterCredit: MembershipPerksSnapshot = {
      productTier: 'elite_circle',
      premiumCreditsRemaining: 1,
      creditsGranted: 2,
      guestInvitesRemaining: 1,
    }

    const afterNotGoing = applyRsvpPerksSnapshot({
      previous: afterCredit,
      usedCredit: false,
      perks: {
        productTier: 'elite_circle',
        // Server snapshot still 1 — no credit refund
        premiumCreditsRemaining: 1,
        creditsGranted: 2,
        guestInvitesRemaining: 1,
      },
    })

    expect(afterNotGoing.premiumCreditsRemaining).toBe(1)
    expect(membershipPerksSummaryFromSnapshot(afterNotGoing)).toBe(
      'You have 1 of 2 premium credits and 1 guest invite(s) remaining this billing period.'
    )
  })

  it('clamps a buggy Not going payload that tries to restore credits', () => {
    const afterCredit: MembershipPerksSnapshot = {
      productTier: 'elite_circle',
      premiumCreditsRemaining: 1,
      creditsGranted: 2,
      guestInvitesRemaining: 1,
    }

    const clamped = applyRsvpPerksSnapshot({
      previous: afterCredit,
      usedCredit: false,
      perks: {
        ...afterCredit,
        premiumCreditsRemaining: 2,
      },
    })

    expect(clamped.premiumCreditsRemaining).toBe(1)
  })

  it('decrements locally when usedCredit is true and perks snapshot is missing', () => {
    const after = applyRsvpPerksSnapshot({
      previous: eliteFull,
      usedCredit: true,
    })
    expect(after.premiumCreditsRemaining).toBe(1)
    expect(membershipPerksSummaryFromSnapshot(after)).toContain('1 of 2')
  })

  it('leaves credits unchanged for fee/checkout path (usedCredit false)', () => {
    const after = applyRsvpPerksSnapshot({
      previous: eliteFull,
      usedCredit: false,
    })
    expect(after.premiumCreditsRemaining).toBe(2)
  })
})
