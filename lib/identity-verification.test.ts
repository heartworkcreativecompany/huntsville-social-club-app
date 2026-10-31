import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  acceptedIdentityStatus,
  legacyInPersonInsert,
  refuseLegacyIdentityGateUpdate,
  resolveIdentityVerification,
} from '@/lib/identity-verification'
import { isMemberPubliclyVerified } from '@/lib/membership-systems'

const MIGRATION = readFileSync(
  'supabase/migrations/20261027200000_in_person_identity_verification.sql',
  'utf8'
)
const PREVIEW = readFileSync(
  'scripts/legacy-in-person-identity-preview.sql',
  'utf8'
)
const MESSAGING = readFileSync('lib/require-messaging.ts', 'utf8')
const BADGES = readFileSync('lib/membership-systems.ts', 'utf8')

describe('resolveIdentityVerification', () => {
  it('accepts Stripe verification', () => {
    expect(
      resolveIdentityVerification({
        stripeStatus: 'verified',
        inPerson: null,
      })
    ).toEqual({ verified: true, methods: ['stripe'] })
  })

  it('accepts in-person verification', () => {
    expect(
      resolveIdentityVerification({
        stripeStatus: 'not_started',
        inPerson: { status: 'verified', revokedAt: null },
      })
    ).toEqual({ verified: true, methods: ['in_person'] })
  })

  it('accepts neither method as unverified', () => {
    expect(
      resolveIdentityVerification({
        stripeStatus: 'requires_input',
        inPerson: null,
      })
    ).toEqual({ verified: false, methods: [] })
  })

  it('keeps both methods when both are valid', () => {
    expect(
      resolveIdentityVerification({
        stripeStatus: 'verified',
        inPerson: { status: 'verified', revokedAt: null },
      })
    ).toEqual({ verified: true, methods: ['stripe', 'in_person'] })
  })

  it('keeps Stripe valid after in-person revocation', () => {
    expect(
      resolveIdentityVerification({
        stripeStatus: 'verified',
        inPerson: { status: 'revoked', revokedAt: '2026-10-27T00:00:00.000Z' },
      })
    ).toEqual({ verified: true, methods: ['stripe'] })
  })

  it('keeps in-person valid when Stripe is absent', () => {
    expect(
      resolveIdentityVerification({
        stripeStatus: 'not_started',
        inPerson: { status: 'verified', revokedAt: null },
      }).methods
    ).toEqual(['in_person'])
  })

  it('ignores paid, admin, complimentary, founder, and legacy-gate signals', () => {
    expect(
      resolveIdentityVerification({
        stripeStatus: 'not_started',
        inPerson: null,
        billingTier: 'elite_circle',
        complimentary: true,
        role: 'admin',
        founder: true,
        approvalGateIdentity: 'approved',
      })
    ).toEqual({ verified: false, methods: [] })
  })
})

describe('legacy in-person recognition', () => {
  it('recognizes an explicit identity-step approval without inventing audit details', () => {
    const row = legacyInPersonInsert(
      {
        approvalGateIdentity: 'approved',
        stripeStatus: 'not_started',
        membershipApprovedAt: '2026-09-01T00:00:00.000Z',
      },
      '2026-10-27T18:00:00.000Z'
    )

    expect(row).toEqual({
      method: 'in_person',
      status: 'verified',
      source: 'legacy_approval_gates.identity_verified',
      approved_by: null,
      approved_at: null,
      reconciled_at: '2026-10-27T18:00:00.000Z',
      note: null,
    })
    expect(row?.approved_at).not.toBe('2026-09-01T00:00:00.000Z')
  })

  it('does not treat Stripe success, membership approval, or other checks as the legacy source', () => {
    expect(
      legacyInPersonInsert(
        { approvalGateIdentity: 'approved', stripeStatus: 'verified' },
        '2026-10-27T18:00:00.000Z'
      )
    ).toBeNull()
    expect(
      legacyInPersonInsert(
        { approvalGateIdentity: 'incomplete', stripeStatus: 'not_started' },
        '2026-10-27T18:00:00.000Z'
      )
    ).toBeNull()
  })
})

describe('accepted identity resolver', () => {
  it('accepts an active in-person record', () => {
    expect(
      acceptedIdentityStatus({
        stripeStatus: 'not_started',
        inPersonLookup: {
          ok: true,
          record: { status: 'verified', revokedAt: null },
        },
      })
    ).toBe('verified')
  })

  it('removes eligibility when in-person is revoked and Stripe is not verified', () => {
    expect(
      acceptedIdentityStatus({
        stripeStatus: 'requires_input',
        inPersonLookup: {
          ok: true,
          record: { status: 'revoked', revokedAt: '2026-10-02T00:00:00.000Z' },
        },
      })
    ).toBe('unverified')
  })

  it('keeps Stripe accepted after in-person revocation', () => {
    expect(
      acceptedIdentityStatus({
        stripeStatus: 'verified',
        inPersonLookup: {
          ok: true,
          record: { status: 'revoked', revokedAt: '2026-10-02T00:00:00.000Z' },
        },
      })
    ).toBe('verified')
  })

  it('does not grant the public verified badge from identity alone', () => {
    expect(isMemberPubliclyVerified({ email: 'incomplete' }, 'verified')).toBe(
      false
    )
    expect(
      isMemberPubliclyVerified(
        {
          email: 'approved',
          phone: 'approved',
          profile_reviewed: 'approved',
          photo_reviewed: 'approved',
          locality: 'approved',
        },
        'verified'
      )
    ).toBe(true)
    expect(
      isMemberPubliclyVerified(
        {
          email: 'approved',
          phone: 'approved',
          profile_reviewed: 'approved',
          photo_reviewed: 'approved',
          locality: 'approved',
        },
        'unverified'
      )
    ).toBe(false)
  })
})

describe('membership approval no longer writes identity', () => {
  it('refuses the old identity gate update', () => {
    expect(refuseLegacyIdentityGateUpdate('identity_verified')).toMatch(
      /in-person/i
    )
    expect(refuseLegacyIdentityGateUpdate('photos_reviewed')).toBeNull()
  })
})

describe('migration boundaries', () => {
  it('keeps the original migration from rewriting messaging and wires later checks to the resolver', () => {
    expect(MIGRATION).toContain('in_person_identity_verifications')
    expect(MIGRATION).toContain('legacy_approval_gates.identity_verified')
    expect(MIGRATION).not.toContain('member_has_paid_messaging')
    expect(MIGRATION).not.toContain('insert into public.in_person_identity_verifications')
    expect(PREVIEW).toContain("approval_gates ->> 'identity_verified' = 'approved'")
    expect(PREVIEW).toContain('identity_verification_status is distinct from')
    expect(PREVIEW).toContain('approved_by')
    expect(PREVIEW).toContain('null')
    expect(MESSAGING).toContain('loadAcceptedIdentityStatus')
    expect(MESSAGING).not.toContain('canUseMessaging')
    const publicBadge = BADGES.slice(
      BADGES.indexOf('export function publicVerifiedBadgeReason')
    ).slice(0, 900)
    expect(publicBadge).toContain('state.email === \'approved\'')
    expect(publicBadge).toContain('identity !== \'verified\'')
    expect(publicBadge).not.toContain('identity_verification_status')
    expect(publicBadge).not.toContain('in_person')
  })
})
