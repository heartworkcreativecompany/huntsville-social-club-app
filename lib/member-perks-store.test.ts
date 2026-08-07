import { describe, expect, it, beforeEach } from 'vitest'
import {
  membershipPerksSummaryFromSnapshot,
  type MembershipPerksSnapshot,
} from '@/lib/event-rsvp-window'
import {
  applyRsvpResultToMemberPerksStore,
  dashboardCreditsSummaryFromSnapshot,
  getMemberPerksSnapshot,
  hydrateMemberPerksFromServer,
  resetMemberPerksStoreForTests,
  updateMemberPerksFromSnapshot,
} from '@/lib/member-perks-store'

const period = {
  periodStart: '2026-08-01T00:00:00.000Z',
  periodEnd: '2026-09-01T00:00:00.000Z',
}

const eliteFull: MembershipPerksSnapshot = {
  productTier: 'elite_circle',
  premiumCreditsRemaining: 2,
  creditsGranted: 2,
  guestInvitesRemaining: 1,
  ...period,
}

describe('shared member perks store', () => {
  beforeEach(() => {
    resetMemberPerksStoreForTests()
  })

  it('updates event + dashboard copy after Elite Going consumes a credit', () => {
    hydrateMemberPerksFromServer(eliteFull)

    applyRsvpResultToMemberPerksStore({
      usedCredit: true,
      perks: {
        ...eliteFull,
        premiumCreditsRemaining: 1,
      },
    })

    const live = getMemberPerksSnapshot()
    expect(live?.premiumCreditsRemaining).toBe(1)

    expect(membershipPerksSummaryFromSnapshot(live!)).toBe(
      'You have 1 of 2 premium credits and 1 guest invite(s) remaining this billing period.'
    )
    expect(dashboardCreditsSummaryFromSnapshot(live!)).toBe(
      'You have 1 of 2 included premium event credits remaining this billing period'
    )
  })

  it('does not refund credits on Going → Not going in the shared store', () => {
    hydrateMemberPerksFromServer(eliteFull)
    applyRsvpResultToMemberPerksStore({
      usedCredit: true,
      perks: { ...eliteFull, premiumCreditsRemaining: 1 },
    })

    applyRsvpResultToMemberPerksStore({
      usedCredit: false,
      perks: {
        ...eliteFull,
        // Server correctly keeps credits at 1; if a buggy payload tried to
        // restore 2, the store must still refuse a refund.
        premiumCreditsRemaining: 2,
        guestInvitesRemaining: 1,
      },
    })

    const live = getMemberPerksSnapshot()
    expect(live?.premiumCreditsRemaining).toBe(1)
    expect(dashboardCreditsSummaryFromSnapshot(live!)).toContain('1 of 2')
  })

  it('keeps 1 of 2 after Not going with an honest server snapshot', () => {
    hydrateMemberPerksFromServer(eliteFull)
    applyRsvpResultToMemberPerksStore({
      usedCredit: true,
      perks: { ...eliteFull, premiumCreditsRemaining: 1 },
    })

    applyRsvpResultToMemberPerksStore({
      usedCredit: false,
      perks: { ...eliteFull, premiumCreditsRemaining: 1 },
    })

    expect(getMemberPerksSnapshot()?.premiumCreditsRemaining).toBe(1)
    expect(
      membershipPerksSummaryFromSnapshot(getMemberPerksSnapshot()!)
    ).toContain('1 of 2')
  })

  it('updates guest invites across views when an invite is used or returned', () => {
    hydrateMemberPerksFromServer(eliteFull)

    updateMemberPerksFromSnapshot({
      ...eliteFull,
      premiumCreditsRemaining: 1,
      guestInvitesRemaining: 0,
    })
    expect(getMemberPerksSnapshot()?.guestInvitesRemaining).toBe(0)

    updateMemberPerksFromSnapshot({
      ...eliteFull,
      premiumCreditsRemaining: 1,
      guestInvitesRemaining: 1,
    })
    expect(getMemberPerksSnapshot()?.guestInvitesRemaining).toBe(1)
    expect(getMemberPerksSnapshot()?.premiumCreditsRemaining).toBe(1)
  })

  it('does not let a stale server hydrate restore spent credits', () => {
    hydrateMemberPerksFromServer(eliteFull)
    applyRsvpResultToMemberPerksStore({
      usedCredit: true,
      perks: { ...eliteFull, premiumCreditsRemaining: 1 },
    })

    hydrateMemberPerksFromServer(eliteFull)
    expect(getMemberPerksSnapshot()?.premiumCreditsRemaining).toBe(1)
  })
})
