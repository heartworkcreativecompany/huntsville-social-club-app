import { describe, expect, it } from 'vitest'
import { identityVerificationRowState } from '@/lib/membership-systems'

describe('identityVerificationRowState', () => {
  it('exposes Verified / Needs retry / Canceled / Not started / Processing', () => {
    expect(identityVerificationRowState('verified', 'approved').label).toBe(
      'Verified'
    )
    expect(
      identityVerificationRowState('requires_input', 'needs_followup').label
    ).toBe('Needs retry')
    expect(identityVerificationRowState('canceled', 'incomplete').cta).toBe(
      'start'
    )
    expect(identityVerificationRowState('canceled', 'incomplete').label).toBe(
      'Canceled'
    )
    expect(identityVerificationRowState('not_started', 'incomplete').label).toBe(
      'Not started'
    )
    expect(identityVerificationRowState('processing', 'pending_review').label).toBe(
      'Processing'
    )
  })

  it('allows retry after requires_input', () => {
    expect(
      identityVerificationRowState('requires_input', 'needs_followup').cta
    ).toBe('retry')
  })
})
