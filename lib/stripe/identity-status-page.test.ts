import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/link', () => ({
  default: ({ children }: { children?: ReactNode }) => children ?? null,
}))
vi.mock('next/navigation', () => ({
  redirect: () => {
    throw new Error('redirect')
  },
}))
vi.mock('@/components/application/application-status-panel', () => ({
  default: () => createElement('section', null, 'Application status'),
}))
vi.mock('@/lib/viewer', () => ({
  getViewer: async () => ({
    userId: 'applicant-1',
    email: 'applicant@example.com',
    authPhone: null,
    applicationStatus: 'submitted',
    profile: {
      identity_verification_status: 'processing',
      identity_verification_session_id: 'vs_current',
      approval_gates: {},
      application_submitted_at: null,
      verified_at: null,
      admin_review_notes: null,
      identity_verified_at: null,
      identity_verification_last_error: null,
      verified_phone_e164: null,
    },
  }),
}))
vi.mock('@/lib/load-profile', () => ({
  loadProfileForUser: async () => ({
    profile: {
      identity_verification_status: 'processing',
      approval_gates: {},
      application_submitted_at: null,
      verified_at: null,
      admin_review_notes: null,
      identity_verified_at: null,
      identity_verification_last_error: null,
      verified_phone_e164: null,
    },
    schemaReady: true,
  }),
}))
vi.mock('@/lib/approval-gate-sync', () => ({
  syncEmailApprovalGateForUser: async () => undefined,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: 'applicant-1', email: 'applicant@example.com' } },
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              identity_verification_status: 'processing',
              identity_verification_session_id: 'vs_current',
            },
            error: null,
          }),
        }),
      }),
    }),
  }),
}))
vi.mock('@/lib/stripe/config', () => ({
  getStripe: () => ({
    identity: {
      verificationSessions: {
        retrieve: async () => {
          throw new Error('stripe retrieve failed for vs_secret_session')
        },
      },
    },
  }),
  appBaseUrl: () => 'http://localhost:3000',
  isStripeIdentityConfigured: () => true,
}))

import ApplicationStatusPage from '@/app/(club)/application/status/page'

describe('application status page reconciliation', () => {
  it('still renders when identity reconciliation fails', async () => {
    const page = await ApplicationStatusPage({
      searchParams: Promise.resolve({ identity: 'return' }),
    })
    const html = renderToStaticMarkup(page)

    expect(html).toContain('Application status')
    expect(html).not.toContain('vs_secret_session')
    expect(html).not.toContain('stripe retrieve failed')
  })
})
