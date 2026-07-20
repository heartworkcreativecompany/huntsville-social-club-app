import { describe, expect, it } from 'vitest'
import {
  MEMBER_VERIFIED_BADGE_LABEL,
  canApproveMember,
  cardVerificationBadges,
  emptyApprovalGates,
  initializeApprovalGatesForSubmit,
  isMemberPubliclyVerified,
  memberVerifiedTrustBadge,
} from '@/lib/membership-systems'

describe('canApproveMember', () => {
  it('allows approval when required gates are approved even if phone is incomplete', () => {
    const gates = emptyApprovalGates()
    gates.email_verified = 'approved'
    gates.identity_verified = 'approved'
    gates.photos_reviewed = 'approved'
    gates.application_reviewed = 'approved'
    gates.locality_confirmed = 'approved'
    gates.phone_verified = 'incomplete'

    expect(canApproveMember(gates)).toEqual({ allowed: true, blockers: [] })
  })

  it('blocks approval when identity is not verified', () => {
    const gates = emptyApprovalGates()
    gates.email_verified = 'approved'
    gates.identity_verified = 'incomplete'
    gates.photos_reviewed = 'approved'
    gates.application_reviewed = 'approved'
    gates.locality_confirmed = 'approved'

    const check = canApproveMember(gates)
    expect(check.allowed).toBe(false)
    expect(check.blockers.some((item) => item.includes('Identity'))).toBe(true)
  })

  it('blocks approval when a required gate is pending', () => {
    const gates = initializeApprovalGatesForSubmit(false)
    const check = canApproveMember(gates)
    expect(check.allowed).toBe(false)
    expect(check.blockers.length).toBeGreaterThan(0)
    expect(check.blockers.some((item) => item.includes('Phone'))).toBe(false)
  })
})

describe('isMemberPubliclyVerified', () => {
  it('requires email, phone, profile, photo, and locality', () => {
    expect(
      isMemberPubliclyVerified({
        email: 'approved',
        phone: 'approved',
        profile_reviewed: 'approved',
        photo_reviewed: 'approved',
        locality: 'approved',
      })
    ).toBe(true)

    expect(
      isMemberPubliclyVerified({
        email: 'approved',
        phone: 'incomplete',
        profile_reviewed: 'approved',
        photo_reviewed: 'approved',
        locality: 'approved',
      })
    ).toBe(false)

    expect(
      isMemberPubliclyVerified({
        profile_reviewed: 'approved',
        photo_reviewed: 'approved',
        locality: 'approved',
      })
    ).toBe(false)
  })
})

describe('memberVerifiedTrustBadge', () => {
  it('returns a single verified badge only when fully verified', () => {
    expect(
      memberVerifiedTrustBadge({
        email: 'approved',
        phone: 'approved',
        profile_reviewed: 'approved',
        photo_reviewed: 'approved',
        locality: 'approved',
      })
    ).toEqual({
      key: 'verified',
      label: MEMBER_VERIFIED_BADGE_LABEL,
      variant: 'trust',
    })

    expect(
      cardVerificationBadges({
        email: 'approved',
        photo_reviewed: 'approved',
      })
    ).toEqual([])
  })
})
