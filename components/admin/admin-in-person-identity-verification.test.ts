import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import AdminInPersonIdentityVerification from '@/components/admin/admin-in-person-identity-verification'
import {
  IN_PERSON_RECORD_BUTTON,
  IN_PERSON_RECORD_CONFIRMATION,
  IN_PERSON_REVOCATION_EXPLANATION,
  IN_PERSON_REVOKE_BUTTON,
} from '@/lib/identity-verification-admin'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined }),
}))

vi.mock('@/app/(club)/admin/applications/identity-actions', () => ({
  approveInPersonIdentityVerification: vi.fn(),
  revokeInPersonIdentityVerification: vi.fn(),
}))

describe('admin in-person identity verification', () => {
  it('requires the in-person confirmation and does not collect a document', () => {
    const html = renderToStaticMarkup(
      createElement(AdminInPersonIdentityVerification, {
        profileId: 'member-2',
        accepted: 'unverified',
        stripeStatus: 'not_started',
        lookupOk: true,
        active: null,
        history: [],
      })
    )

    expect(html).toContain('Accepted')
    expect(html).toContain('Not accepted')
    expect(html).toContain('Stripe Identity')
    expect(html).toContain('Not started')
    expect(html).toContain(IN_PERSON_RECORD_CONFIRMATION)
    expect(html).toContain(IN_PERSON_RECORD_BUTTON)
    expect(html).toContain('disabled')
    expect(html).toContain('It is not Stripe Identity')
    expect(html).toContain(IN_PERSON_REVOCATION_EXPLANATION)
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain('type="file"')
    expect(html).not.toContain(IN_PERSON_REVOKE_BUTTON)
  })

  it('shows the verifier, history, and a required revocation reason', () => {
    const html = renderToStaticMarkup(
      createElement(AdminInPersonIdentityVerification, {
        profileId: 'member-2',
        accepted: 'verified',
        stripeStatus: 'verified',
        lookupOk: true,
        active: {
          id: 'row-2',
          source: 'admin_action',
          approvedAt: '2026-10-03T00:00:00.000Z',
          reconciledAt: null,
          hasApprover: true,
          verifierName: 'Ada Admin',
          note: null,
        },
        history: [
          {
            id: 'row-1',
            recordedAt: '2026-10-01T00:00:00.000Z',
            verifierName: 'Ada Admin',
            revokedAt: '2026-10-02T00:00:00.000Z',
            revokerName: 'Bea Admin',
            reason: 'Wrong member was checked.',
          },
        ],
      })
    )

    expect(html).toContain('Accepted')
    expect(html).toContain('Stripe Identity, In-person record')
    expect(html).toContain('Ada Admin')
    expect(html).toContain('Bea Admin')
    expect(html).toContain('Wrong member was checked.')
    expect(html).toContain(IN_PERSON_REVOKE_BUTTON)
    expect(html).toContain('Revocation reason')
    expect(html).toContain(IN_PERSON_REVOCATION_EXPLANATION)
    expect(html).not.toContain(IN_PERSON_RECORD_BUTTON)
  })
})
