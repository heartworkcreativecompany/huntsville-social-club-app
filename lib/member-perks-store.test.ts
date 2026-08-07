import { describe, expect, it, beforeEach } from 'vitest'
import {
  membershipPerksSummaryFromSnapshot,
  type MembershipPerksSnapshot,
} from '@/lib/event-rsvp-window'
import { buildMemberEntitlements } from '@/lib/membership-entitlements'
import { FREE_MEMBER_PREMIUM_CREDITS_COPY } from '@/lib/membership-pricing-copy'
import {
  applyRsvpResultToMemberPerksStore,
  dashboardCreditsSummaryFromSnapshot,
  freeMemberPerksSnapshot,
  getMemberPerksSnapshot,
  hydrateMemberPerksFromServer,
  membershipPerksSnapshotFromEntitlements,
  normalizeMemberPerksSnapshot,
  resetMemberPerksStoreForTests,
  updateMemberPerksFromSnapshot,
} from '@/lib/member-perks-store'

const period = {
  periodStart: '2026-08-01T00:00:00.000Z',
  periodEnd: '2026-09-01T00:00:00.000Z',
}

const eliteFull: MembershipPerksSnapshot = {
  productTier: 'elite_circle',
  hasPaidMembership: true,
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

  it('normalizes free / no-subscription members to zero credits and invites', () => {
    const free = normalizeMemberPerksSnapshot({
      productTier: 'member',
      hasPaidMembership: false,
      // Spoofed Elite defaults must not stick
      premiumCreditsRemaining: 2,
      creditsGranted: 2,
      guestInvitesRemaining: 1,
      ...period,
    })

    expect(free).toEqual(freeMemberPerksSnapshot())
    expect(free.premiumCreditsRemaining).toBe(0)
    expect(free.creditsGranted).toBe(0)
    expect(free.guestInvitesRemaining).toBe(0)
    expect(membershipPerksSummaryFromSnapshot(free)).toBeNull()
    expect(dashboardCreditsSummaryFromSnapshot(free)).toBe(
      FREE_MEMBER_PREMIUM_CREDITS_COPY
    )
  })

  it('clears a stale Elite store when hydrating a free member', () => {
    hydrateMemberPerksFromServer(eliteFull)
    expect(getMemberPerksSnapshot()?.premiumCreditsRemaining).toBe(2)

    hydrateMemberPerksFromServer(freeMemberPerksSnapshot())
    const live = getMemberPerksSnapshot()
    expect(live?.hasPaidMembership).toBe(false)
    expect(live?.premiumCreditsRemaining).toBe(0)
    expect(live?.guestInvitesRemaining).toBe(0)
    expect(dashboardCreditsSummaryFromSnapshot(live!)).toBe(
      FREE_MEMBER_PREMIUM_CREDITS_COPY
    )
  })

  it('keeps 1 of 2 when a valid server snapshot is applied twice', () => {
    hydrateMemberPerksFromServer(eliteFull)

    const serverPerks = {
      ...eliteFull,
      premiumCreditsRemaining: 1,
      creditsGranted: 2,
    }

    applyRsvpResultToMemberPerksStore({
      usedCredit: true,
      perks: serverPerks,
    })
    applyRsvpResultToMemberPerksStore({
      usedCredit: true,
      perks: serverPerks,
    })

    const live = getMemberPerksSnapshot()
    expect(live?.premiumCreditsRemaining).toBe(1)
    expect(dashboardCreditsSummaryFromSnapshot(live!)).toContain('1 of 2')
    expect(membershipPerksSummaryFromSnapshot(live!)).toContain('1 of 2')
  })

  it('optimistically decrements once when usedCredit and perks are missing', () => {
    hydrateMemberPerksFromServer(eliteFull)
    applyRsvpResultToMemberPerksStore({ usedCredit: true })
    expect(getMemberPerksSnapshot()?.premiumCreditsRemaining).toBe(1)
  })

  it('builds a free snapshot from member entitlements even with a leftover cycle', () => {
    const entitlements = buildMemberEntitlements({
      role: 'member',
      billing: {
        tier: 'member',
        plan: null,
        subscription_status: 'none',
        stripe_customer_id: null,
        stripe_subscription_id: null,
        renewal_at: null,
        trial_end: null,
        billing_period_end: null,
        payment_failure: { active: false, failed_at: null, reason: null },
      },
      applicationApproved: true,
      activeCycle: {
        id: 'stale-cycle',
        product_tier: 'elite_circle',
        period_start: period.periodStart,
        period_end: period.periodEnd,
        credits_granted: 2,
        credits_used: 0,
        guest_invites_granted: 1,
        guest_invites_used: 0,
        is_active: true,
      },
    })

    expect(entitlements.productTier).toBe('member')
    expect(entitlements.activeCycle).toBeNull()
    expect(entitlements.premiumCreditsRemaining).toBeNull()
    expect(entitlements.guestInvitesRemaining).toBe(0)

    const snapshot = membershipPerksSnapshotFromEntitlements(entitlements)
    expect(snapshot.hasPaidMembership).toBe(false)
    expect(snapshot.premiumCreditsRemaining).toBe(0)
    expect(snapshot.creditsGranted).toBe(0)
  })
})
