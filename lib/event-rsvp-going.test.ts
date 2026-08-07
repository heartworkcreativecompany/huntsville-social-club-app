import { describe, expect, it } from 'vitest'
import {
  isGoingRegistrationEligible,
  resolveGoingButtonState,
} from '@/lib/event-rsvp-going'
import {
  premiumCreditsSummary,
  resolveEventRsvpWindow,
} from '@/lib/event-rsvp-window'

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

describe('premium event layout helpers', () => {
  it('shows Elite priority bubble only while that window is active', () => {
    const active = resolveEventRsvpWindow({
      eventType: 'premium_event',
      priorityRsvpOpensAt: '2026-08-08T18:00:00.000Z',
      generalRsvpOpensAt: '2026-08-10T23:30:00.000Z',
      now: new Date('2026-08-09T12:00:00.000Z'),
    })
    expect(active.phase).toBe('elite_priority')

    const after = resolveEventRsvpWindow({
      eventType: 'premium_event',
      priorityRsvpOpensAt: '2026-08-08T18:00:00.000Z',
      generalRsvpOpensAt: '2026-08-10T23:30:00.000Z',
      now: new Date('2026-08-11T00:00:00.000Z'),
    })
    expect(after.phase).not.toBe('elite_priority')
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
  })
})
