import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildMemberEntitlements,
  membershipPerkCopyLines,
} from '@/lib/membership-entitlements'
import { membershipCardDisplay } from '@/lib/membership-card-display'
import {
  CONNECT_MEMBERSHIP_INCLUDED_COPY,
  FREE_MEMBER_PREMIUM_CREDITS_COPY,
  ELITE_CIRCLE_SOCIALS_INCLUDED_COPY,
} from '@/lib/membership-pricing-copy'
import {
  billedPaidMembershipTier,
  emptyMembershipBilling,
} from '@/lib/membership-systems'
import { effectivePublicTier } from '@/lib/public-member-badges'
import { STRIPE_LIVE_PRICE_IDS } from '@/lib/stripe/config'
import {
  connectBilling,
  freeMemberBilling,
  innerCircleBilling,
} from '@/lib/friendship/test-fixtures'
import { dashboardPerkLinesFromSnapshot } from '@/lib/member-perks-store'
import { membershipPerksSnapshotFromEntitlements } from '@/lib/member-perks-snapshot'

const repoRoot = join(__dirname, '..')
const unknownLivePrice = 'price_unknown_live_not_in_map'

function staleConnectBilling(status: 'active' | 'grace' | 'cancelled' | 'past_due') {
  return {
    ...emptyMembershipBilling(),
    tier: 'member' as const,
    subscription_status: status,
    stripe_subscription_id: 'sub_connect_live',
    stripe_price_id: STRIPE_LIVE_PRICE_IDS.connect,
    stripe_customer_id: 'cus_connect_live',
  }
}

function entitlementsForBilling(billing: unknown) {
  return buildMemberEntitlements({
    applicationApproved: true,
    billing,
  })
}

describe('canonical Connect Stripe price', () => {
  it('is the live Connect price ID', () => {
    expect(STRIPE_LIVE_PRICE_IDS.connect).toBe('price_1UCjKABei7W40myB2Mnqrtse')
  })
})

describe('membership card display from resolved entitlements', () => {
  it('shows Connect for an active Connect price even when billing.tier is still member', () => {
    const entitlements = entitlementsForBilling(staleConnectBilling('active'))
    expect(entitlements.productTier).toBe('connect')
    expect(entitlements.productTierLabel).toBe('Connect')
    expect(entitlements.canMessage).toBe(true)
    expect(entitlements.canUseCuratedMatching).toBe(false)
    expect(entitlements.premiumCreditsRemaining).toBeNull()
    expect(entitlements.circleSocialCreditsRemaining).toBeNull()

    const card = membershipCardDisplay(entitlements)
    expect(card.title).toBe('Connect')
    expect(card.statusLabel).toBe('Active')
    expect(card.perkLines).toEqual([CONNECT_MEMBERSHIP_INCLUDED_COPY])
    expect(card.useCircleCreditSnapshot).toBe(false)
    expect(card.upgradeCta).toEqual({
      href: '/upgrade',
      label: 'Upgrade to Inner Circle',
      variant: 'primary',
    })
    expect(card.showBillingPortal).toBe(true)
    expect(card.showGuestInvites).toBe(false)
  })

  it('keeps persisted Connect through the existing grace status', () => {
    const entitlements = entitlementsForBilling({
      ...connectBilling,
      subscription_status: 'grace',
    })
    const card = membershipCardDisplay(entitlements)
    expect(entitlements.productTier).toBe('connect')
    expect(entitlements.canMessage).toBe(true)
    expect(entitlements.canUseCuratedMatching).toBe(false)
    expect(card.title).toBe('Connect')
    expect(card.statusLabel).toBe('Grace period')
  })

  it('does not grant Connect from a stored price while status is still grace', () => {
    const billing = staleConnectBilling('grace')
    const entitlements = entitlementsForBilling(billing)
    const card = membershipCardDisplay(entitlements)
    expect(entitlements.productTier).toBe('member')
    expect(entitlements.canMessage).toBe(false)
    expect(entitlements.canUseCuratedMatching).toBe(false)
    expect(card.title).toBe('Member')
    expect(effectivePublicTier({ role: 'member', billing })).toBeNull()
    expect(billedPaidMembershipTier(billing)).toBeNull()
  })

  it('keeps persisted Inner Circle through grace and blocks stale Member + Inner price', () => {
    const persisted = entitlementsForBilling({
      ...innerCircleBilling,
      stripe_price_id: STRIPE_LIVE_PRICE_IDS.inner_circle,
      subscription_status: 'grace',
    })
    expect(persisted.productTier).toBe('inner_circle')
    expect(persisted.canMessage).toBe(true)
    expect(persisted.canUseCuratedMatching).toBe(true)

    const stale = {
      ...emptyMembershipBilling(),
      tier: 'member' as const,
      subscription_status: 'grace' as const,
      stripe_subscription_id: 'sub_inner_live',
      stripe_price_id: STRIPE_LIVE_PRICE_IDS.inner_circle,
    }
    const staleEntitlements = entitlementsForBilling(stale)
    expect(staleEntitlements.productTier).toBe('member')
    expect(staleEntitlements.canMessage).toBe(false)
    expect(staleEntitlements.canUseCuratedMatching).toBe(false)
    expect(staleEntitlements.premiumCreditsRemaining).toBeNull()
    expect(effectivePublicTier({ role: 'member', billing: stale })).toBeNull()
    expect(billedPaidMembershipTier(stale)).toBeNull()
  })

  it('keeps persisted Elite Circle through grace and blocks stale Member + Elite price', () => {
    const persisted = entitlementsForBilling({
      ...innerCircleBilling,
      tier: 'elite_circle',
      stripe_price_id: STRIPE_LIVE_PRICE_IDS.elite_circle,
      subscription_status: 'grace',
    })
    expect(persisted.productTier).toBe('elite_circle')
    expect(persisted.canMessage).toBe(true)
    expect(persisted.canUseCuratedMatching).toBe(true)

    const stale = {
      ...emptyMembershipBilling(),
      tier: 'member' as const,
      subscription_status: 'grace' as const,
      stripe_subscription_id: 'sub_elite_live',
      stripe_price_id: STRIPE_LIVE_PRICE_IDS.elite_circle,
    }
    const staleEntitlements = entitlementsForBilling(stale)
    expect(staleEntitlements.productTier).toBe('member')
    expect(staleEntitlements.canMessage).toBe(false)
    expect(staleEntitlements.canUseCuratedMatching).toBe(false)
    expect(effectivePublicTier({ role: 'member', billing: stale })).toBeNull()
    expect(billedPaidMembershipTier(stale)).toBeNull()
  })

  it('does not grant paid access from an unknown price in active or grace', () => {
    const unknownActive = {
      ...emptyMembershipBilling(),
      tier: 'member' as const,
      subscription_status: 'active' as const,
      stripe_subscription_id: 'sub_unknown',
      stripe_price_id: unknownLivePrice,
    }
    const unknownGrace = {
      ...unknownActive,
      subscription_status: 'grace' as const,
    }
    for (const billing of [unknownActive, unknownGrace]) {
      const entitlements = entitlementsForBilling(billing)
      expect(entitlements.productTier).toBe('member')
      expect(entitlements.canMessage).toBe(false)
      expect(billedPaidMembershipTier(billing)).toBeNull()
      expect(effectivePublicTier({ role: 'member', billing })).toBeNull()
    }
  })

  it('keeps free Member display when there is no Stripe subscription', () => {
    const entitlements = entitlementsForBilling(freeMemberBilling)
    const card = membershipCardDisplay(entitlements)
    expect(entitlements.productTier).toBe('member')
    expect(card.title).toBe('Member')
    expect(card.statusLabel).toBe('No subscription')
    expect(card.perkLines).toEqual([FREE_MEMBER_PREMIUM_CREDITS_COPY])
    expect(card.upgradeCta).toEqual({
      href: '/upgrade',
      label: 'View memberships',
      variant: 'primary',
    })
    expect(card.showBillingPortal).toBe(false)
  })

  it('keeps Inner Circle credit snapshot display unchanged', () => {
    const entitlements = buildMemberEntitlements({
      applicationApproved: true,
      billing: innerCircleBilling,
      activeCycle: {
        id: 'cycle-1',
        product_tier: 'inner_circle',
        period_start: '2026-08-01T00:00:00.000Z',
        period_end: '2026-09-01T00:00:00.000Z',
        credits_granted: 1,
        credits_used: 0,
        guest_invites_granted: 0,
        guest_invites_used: 0,
        circle_social_credits_granted: 2,
        circle_social_credits_used: 0,
        is_active: true,
      },
    })
    const card = membershipCardDisplay(entitlements)
    expect(card.title).toBe('Inner Circle')
    expect(card.statusLabel).toBe('Active')
    expect(card.useCircleCreditSnapshot).toBe(true)
    expect(card.upgradeCta).toEqual({
      href: '/upgrade',
      label: 'Change plan',
      variant: 'secondary',
    })
    expect(card.showGuestInvites).toBe(false)
    const snapshotLines = dashboardPerkLinesFromSnapshot(
      membershipPerksSnapshotFromEntitlements(entitlements)
    )
    expect(snapshotLines.join(' ')).toMatch(/premium event credit/i)
    expect(snapshotLines.join(' ')).toMatch(/Circle Social credit/i)
  })

  it('keeps Elite Circle credit snapshot display unchanged', () => {
    const entitlements = buildMemberEntitlements({
      applicationApproved: true,
      billing: { ...innerCircleBilling, tier: 'elite_circle' },
      activeCycle: {
        id: 'cycle-1',
        product_tier: 'elite_circle',
        period_start: '2026-08-01T00:00:00.000Z',
        period_end: '2026-09-01T00:00:00.000Z',
        credits_granted: 2,
        credits_used: 0,
        guest_invites_granted: 1,
        guest_invites_used: 0,
        circle_social_credits_granted: null,
        circle_social_credits_used: 0,
        is_active: true,
      },
    })
    const card = membershipCardDisplay(entitlements)
    expect(card.title).toBe('Elite Circle')
    expect(card.useCircleCreditSnapshot).toBe(true)
    expect(card.upgradeCta).toBeNull()
    expect(card.showGuestInvites).toBe(true)
    const snapshotLines = dashboardPerkLinesFromSnapshot(
      membershipPerksSnapshotFromEntitlements(entitlements)
    )
    expect(snapshotLines).toContain(ELITE_CIRCLE_SOCIALS_INCLUDED_COPY)
  })

  it('does not label an unknown active Stripe price as Connect', () => {
    const billing = {
      ...emptyMembershipBilling(),
      tier: 'member' as const,
      subscription_status: 'active' as const,
      stripe_subscription_id: 'sub_unknown',
      stripe_price_id: unknownLivePrice,
    }
    const entitlements = entitlementsForBilling(billing)
    const card = membershipCardDisplay(entitlements)
    expect(entitlements.productTier).toBe('member')
    expect(entitlements.canMessage).toBe(false)
    expect(card.title).toBe('Member')
    expect(card.perkLines).toEqual([FREE_MEMBER_PREMIUM_CREDITS_COPY])
    expect(billedPaidMembershipTier(entitlements.billing)).toBeNull()
    expect(effectivePublicTier({ role: 'member', billing })).toBeNull()
  })

  it('does not promise credits or Circle matching on Connect copy', () => {
    const entitlements = entitlementsForBilling(connectBilling)
    const copy = membershipPerkCopyLines(entitlements).join(' ')
    expect(copy).toBe(CONNECT_MEMBERSHIP_INCLUDED_COPY)
    expect(copy).not.toMatch(/credit/i)
    expect(copy).not.toMatch(/curated match/i)
    expect(copy).not.toMatch(/Circle Social/i)
    expect(copy).not.toMatch(/premium event/i)

    const card = membershipCardDisplay(entitlements)
    expect(card.perkLines.join(' ')).toBe(CONNECT_MEMBERSHIP_INCLUDED_COPY)
    expect(card.upgradeCta?.label).toBe('Upgrade to Inner Circle')
  })

  it('feeds canonical Connect display data to badge consumers', () => {
    const billing = staleConnectBilling('active')
    expect(effectivePublicTier({ role: 'member', billing })).toBe('connect')
    expect(billedPaidMembershipTier(billing)).toBe('connect')
  })

  it('does not treat a cancelled leftover Connect price as Connect', () => {
    const billing = staleConnectBilling('cancelled')
    const entitlements = entitlementsForBilling(billing)
    expect(entitlements.productTier).toBe('member')
    expect(effectivePublicTier({ role: 'member', billing })).toBeNull()
    expect(membershipCardDisplay(entitlements).title).toBe('Member')
  })

  it('does not treat a past_due stale Member record as Connect', () => {
    const billing = staleConnectBilling('past_due')
    const entitlements = entitlementsForBilling(billing)
    expect(entitlements.productTier).toBe('member')
    expect(entitlements.canMessage).toBe(false)
    expect(billedPaidMembershipTier(billing)).toBeNull()
    expect(membershipCardDisplay(entitlements).title).toBe('Member')
  })
})

describe('membership card consumers', () => {
  it('profile usage card and public badges use the shared display/tier resolvers', () => {
    const displaySource = readFileSync(
      join(repoRoot, 'lib/membership-card-display.ts'),
      'utf8'
    )
    expect(displaySource).toContain("label: 'Upgrade to Inner Circle'")

    const cardSource = readFileSync(
      join(repoRoot, 'components/membership/membership-usage-card.tsx'),
      'utf8'
    )
    expect(cardSource).toContain('membershipCardDisplay')
    expect(cardSource).toContain('display.title')

    const badges = readFileSync(
      join(repoRoot, 'lib/public-member-badges.ts'),
      'utf8'
    )
    expect(badges).toContain('paidTierFromActiveStoredPriceId')
  })
})
