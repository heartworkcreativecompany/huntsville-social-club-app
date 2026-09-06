import { describe, expect, it } from 'vitest'
import {
  cardVerificationBadges,
  membershipTierBadge,
  publicPremiumBadge,
  emptyPremiumVerification,
} from '@/lib/membership-systems'
import { directoryCardBadges } from '@/lib/members-discovery'

describe('membership tier badge variants', () => {
  it('uses outline gold for Inner Circle and solid gold for Elite Circle', () => {
    expect(membershipTierBadge('inner_circle').variant).toBe('premium_outline')
    expect(membershipTierBadge('elite_circle').variant).toBe('elite')
  })

  it('uses accent styling for the Connect badge', () => {
    expect(membershipTierBadge('connect')).toEqual({
      key: 'connect',
      label: 'Connect',
      variant: 'accent',
    })
  })

  it('maps Community partner to the Member badge for display', () => {
    expect(membershipTierBadge('community_partner')).toEqual({
      key: 'member',
      label: 'Member',
      variant: 'category',
    })
  })

  it('uses trust styling for vendor-reviewed tier labels', () => {
    expect(membershipTierBadge('vendor_reviewed').variant).toBe('trust')
  })
})

describe('verification badge variants', () => {
  it('returns a single verified badge when all trust requirements are met', () => {
    const badges = cardVerificationBadges({
      email: 'approved',
      phone: 'approved',
      profile_reviewed: 'approved',
      photo_reviewed: 'approved',
      locality: 'approved',
    })

    expect(badges).toEqual([
      { key: 'verified', label: 'Verified', variant: 'trust' },
    ])
    expect(badges.some((badge) => badge.label === 'Email verified')).toBe(false)
    expect(badges.some((badge) => badge.label === 'Photo reviewed')).toBe(false)
  })

  it('uses trust styling for completed vendor premium badges', () => {
    const badge = publicPremiumBadge({
      ...emptyPremiumVerification(),
      consent_captured: true,
      id_verification: 'approved',
      liveness_match: 'approved',
      background_check: 'approved',
      public_badge: 'vendor_reviewed',
      admin_hold: false,
    })

    expect(badge?.variant).toBe('trust')
  })
})

describe('directory card badge composition', () => {
  it('shows membership tier only on member-facing cards', () => {
    const badges = directoryCardBadges({
      id: 'member-1',
      contactEmail: null,
      full_name: 'Alex',
      role: 'member',
      created_at: null,
      membership_intent: null,
      verified_at: null,
      membership_status: null,
      photos: [],
      location_area: null,
      discovery_intent: 'mixed',
      location_city: null,
      location_zip: null,
      birth_year: null,
      discovery_interests: [],
      discovery_industry: null,
      public_intents: ['networking', 'dating'],
      verification_state: {
        email: 'approved',
        phone: 'approved',
        profile_reviewed: 'approved',
        photo_reviewed: 'approved',
        locality: 'approved',
      },
      membership_tier: 'inner_circle',
      vendor_reviewed_badge: false,
    })

    expect(badges).toEqual([
      { key: 'inner_circle', label: 'Inner Circle', variant: 'premium_outline' },
    ])
    expect(badges.some((badge) => badge.label === 'Verified')).toBe(false)
  })
})
