import { describe, expect, it } from 'vitest'
import {
  cardVerificationBadges,
  membershipTierBadge,
  publicPremiumBadge,
  emptyPremiumVerification,
} from '@/lib/membership-systems'
import { directoryCardBadges } from '@/lib/members-discovery'

describe('membership tier badge variants', () => {
  it('uses gold for paid membership tiers', () => {
    expect(membershipTierBadge('inner_circle').variant).toBe('premium')
    expect(membershipTierBadge('elite_circle').variant).toBe('premium')
  })

  it('uses muted category styling for the base member tier', () => {
    expect(membershipTierBadge('member').variant).toBe('category')
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
      { key: 'inner_circle', label: 'Inner Circle', variant: 'premium' },
    ])
    expect(badges.some((badge) => badge.label === 'Verified')).toBe(false)
  })
})
