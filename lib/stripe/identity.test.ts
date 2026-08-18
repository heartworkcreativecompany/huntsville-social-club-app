import { describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import {
  IDENTITY_FORBIDDEN_PROFILE_KEYS,
  buildIdentityProfilePatch,
  identityLastErrorMessage,
  mapStripeIdentityStatus,
  memberFacingIdentityRetryReason,
} from '@/lib/stripe/identity-status'
import { identityVerificationDisplayLabel } from '@/lib/membership-systems'
import { constructVerifiedStripeEvent } from '@/lib/stripe/verify-webhook-signature'

function stubSession(input: {
  status: Stripe.Identity.VerificationSession.Status
  userId?: string | null
  sessionId?: string
  lastError?: { code?: string; reason?: string } | null
  /** Sensitive fields that must never be persisted by our patch builder. */
  verifiedOutputs?: Record<string, unknown>
}): Stripe.Identity.VerificationSession {
  return {
    id: input.sessionId ?? 'vs_test_123',
    object: 'identity.verification_session',
    status: input.status,
    metadata:
      input.userId === null
        ? {}
        : { user_id: input.userId ?? 'user_applicant_1' },
    last_error: input.lastError
      ? {
          code: input.lastError.code as Stripe.Identity.VerificationSession.LastError.Code,
          reason: input.lastError.reason ?? null,
        }
      : null,
    // Stripe may include verified outputs on the object; we must not copy them.
    verified_outputs: input.verifiedOutputs ?? undefined,
  } as unknown as Stripe.Identity.VerificationSession
}

describe('identityVerificationDisplayLabel', () => {
  it('uses explicit admin/member labels (not Pending review)', () => {
    expect(identityVerificationDisplayLabel('not_started')).toBe('Not started')
    expect(identityVerificationDisplayLabel('pending')).toBe('Processing')
    expect(identityVerificationDisplayLabel('processing')).toBe('Processing')
    expect(identityVerificationDisplayLabel('verified')).toBe('Verified')
    expect(identityVerificationDisplayLabel('requires_input')).toBe('Needs retry')
    expect(identityVerificationDisplayLabel('canceled')).toBe('Canceled')
  })
})

describe('buildIdentityProfilePatch', () => {
  const gates = {
    email_verified: 'approved' as const,
    identity_verified: 'incomplete' as const,
    application_reviewed: 'pending_review' as const,
  }

  it('verified webhook updates identity status only — not membership approval', () => {
    const patch = buildIdentityProfilePatch({
      session: stubSession({ status: 'verified' }),
      existingGates: gates,
      existingVerification: { id_verified: 'incomplete' },
      verifiedAtIso: '2026-08-18T12:00:00.000Z',
    })

    expect(patch.identity_verification_status).toBe('verified')
    expect(patch.identity_verified_at).toBe('2026-08-18T12:00:00.000Z')
    expect(patch.identity_verification_session_id).toBe('vs_test_123')
    expect(patch.approval_gates.identity_verified).toBe('approved')
    expect(patch.verification_state.id_verified).toBe('approved')
    expect(patch.identity_verification_last_error).toBeNull()

    for (const key of IDENTITY_FORBIDDEN_PROFILE_KEYS) {
      expect(Object.keys(patch)).not.toContain(key)
    }
    // Membership application approval / role / paid access never in patch
    expect(JSON.stringify(patch)).not.toMatch(/application_status|\"role\"|membership_billing/)
  })

  it('requires_input enables retry state with member-safe reason', () => {
    const patch = buildIdentityProfilePatch({
      session: stubSession({
        status: 'requires_input',
        lastError: {
          code: 'document_expired',
          reason: 'Document number 123-45-6789 expired; DOB 1990-01-01',
        },
      }),
      existingGates: gates,
      existingVerification: {},
    })

    expect(patch.identity_verification_status).toBe('requires_input')
    expect(patch.approval_gates.identity_verified).toBe('needs_followup')
    expect(patch.verification_state.id_verified).toBe('needs_followup')
    expect(patch.identity_verified_at).toBeNull()
    expect(patch.identity_verification_last_error).toMatch(/expired/i)
    expect(patch.identity_verification_last_error).not.toContain('123-45-6789')
    expect(patch.identity_verification_last_error).not.toContain('1990-01-01')
  })

  it('canceled updates status safely and clears verified timestamp', () => {
    const patch = buildIdentityProfilePatch({
      session: stubSession({ status: 'canceled' }),
      existingGates: { ...gates, identity_verified: 'pending_review' },
      existingVerification: { id_verified: 'pending_review' },
    })

    expect(patch.identity_verification_status).toBe('canceled')
    expect(patch.approval_gates.identity_verified).toBe('incomplete')
    expect(patch.identity_verified_at).toBeNull()
    expect(patch.identity_verification_last_error).toBeNull()
  })

  it('duplicate verified event stays idempotent in outcome (same status fields)', () => {
    const session = stubSession({ status: 'verified' })
    const first = buildIdentityProfilePatch({
      session,
      existingGates: gates,
      existingVerification: {},
      verifiedAtIso: '2026-08-18T12:00:00.000Z',
    })
    const second = buildIdentityProfilePatch({
      session,
      existingGates: first.approval_gates,
      existingVerification: first.verification_state,
      verifiedAtIso: '2026-08-18T12:00:00.000Z',
    })

    expect(second.identity_verification_status).toBe('verified')
    expect(second.identity_verification_session_id).toBe(first.identity_verification_session_id)
    expect(second.approval_gates.identity_verified).toBe('approved')
  })

  it('does not persist protected identity data from verified_outputs', () => {
    const patch = buildIdentityProfilePatch({
      session: stubSession({
        status: 'verified',
        verifiedOutputs: {
          first_name: 'Jane',
          last_name: 'Doe',
          id_number: 'D1234567',
          dob: { day: 1, month: 1, year: 1990 },
        },
      }),
      existingGates: gates,
      existingVerification: {},
      verifiedAtIso: '2026-08-18T12:00:00.000Z',
    })

    const serialized = JSON.stringify(patch)
    expect(serialized).not.toContain('Jane')
    expect(serialized).not.toContain('Doe')
    expect(serialized).not.toContain('D1234567')
    expect(serialized).not.toContain('verified_outputs')
    expect(serialized).not.toContain('id_number')
  })
})

describe('memberFacingIdentityRetryReason', () => {
  it('never echoes Stripe reason PII', () => {
    const message = memberFacingIdentityRetryReason(
      stubSession({
        status: 'requires_input',
        lastError: {
          code: 'selfie_failure',
          reason: 'Face mismatch for legal name Jane Q Public',
        },
      })
    )
    expect(message).toMatch(/selfie/i)
    expect(message).not.toContain('Jane')
    expect(identityLastErrorMessage(stubSession({ status: 'requires_input' }))).toBeTruthy()
  })
})

describe('mapStripeIdentityStatus', () => {
  it('maps Stripe statuses', () => {
    expect(mapStripeIdentityStatus('verified')).toBe('verified')
    expect(mapStripeIdentityStatus('requires_input')).toBe('requires_input')
    expect(mapStripeIdentityStatus('canceled')).toBe('canceled')
    expect(mapStripeIdentityStatus('processing')).toBe('processing')
  })
})

describe('constructVerifiedStripeEvent', () => {
  it('rejects invalid signatures so applicants cannot be updated', () => {
    const constructEvent = vi.fn(() => {
      throw new Error('No signatures found matching the expected signature for payload')
    })

    expect(() =>
      constructVerifiedStripeEvent({
        rawBody: '{"id":"evt_fake"}',
        signatureHeader: 't=1,v1=bad',
        webhookSecret: 'whsec_test',
        stripe: { webhooks: { constructEvent } } as unknown as Stripe,
      })
    ).toThrow(/signature/i)

    expect(constructEvent).toHaveBeenCalledWith(
      '{"id":"evt_fake"}',
      't=1,v1=bad',
      'whsec_test'
    )
  })

  it('rejects missing signature header', () => {
    const constructEvent = vi.fn()
    expect(() =>
      constructVerifiedStripeEvent({
        rawBody: '{}',
        signatureHeader: null,
        webhookSecret: 'whsec_test',
        stripe: { webhooks: { constructEvent } } as unknown as Stripe,
      })
    ).toThrow(/Missing Stripe signature/)
    expect(constructEvent).not.toHaveBeenCalled()
  })
})
