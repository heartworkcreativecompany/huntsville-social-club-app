import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

vi.mock('server-only', () => ({}))

const authState: {
  user: { id: string } | null
  role: string | null
} = {
  user: { id: 'admin-1' },
  role: 'admin',
}

const stripeState: { mode: 'verified' | 'throw' | 'db-error' } = { mode: 'verified' }

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: authState.user } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: authState.role ? { role: authState.role } : null,
            error: null,
          }),
        }),
      }),
    }),
  }),
}))

const adminClients: SupabaseClient<Database>[] = []

vi.mock('@/lib/supabase/require-admin-client', () => ({
  requireAdminClient: () => {
    const client = adminClients[0]
    if (!client) throw new Error('missing admin client')
    return client
  },
}))
vi.mock('@/lib/stripe/config', () => ({
  getStripe: () => ({
    identity: {
      verificationSessions: {
        retrieve: async () => {
          if (stripeState.mode === 'throw') {
            throw new Error('stripe retrieve failed for vs_secret_session')
          }
          return {
            id: 'vs_current',
            object: 'identity.verification_session',
            status: 'verified',
            metadata: { user_id: 'applicant-1' },
          }
        },
      },
    },
  }),
  appBaseUrl: () => 'http://localhost:3000',
  isStripeIdentityConfigured: () => true,
}))
vi.mock('@/lib/analytics', () => ({ trackServerEvent: vi.fn() }))
vi.mock('@/lib/compatibility/auto-generate-matches', () => ({
  queueAutoGenerateCuratedMatches: vi.fn(),
}))
vi.mock('@/lib/compatibility/revalidate-curated-match-routes', () => ({
  revalidateCuratedMatchMemberRoutes: vi.fn(),
}))
vi.mock('@/lib/sync-auth-display-name', () => ({
  syncAuthDisplayNameBestEffort: vi.fn(),
}))

import { refreshApplicantIdentityStatus } from '@/app/(club)/admin/applications/actions'

const APPLICANT = {
  id: 'applicant-1',
  identity_verification_status: 'processing',
  identity_verification_session_id: 'vs_current',
  approval_gates: { identity_verified: 'pending_review' },
  verification_state: { id_verified: 'pending_review' },
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function adminClient(mode: 'ok' | 'db-error') {
  const fetchImpl: typeof fetch = async (_input, init) => {
    const method = init?.method ?? 'GET'
    if (method === 'PATCH') {
      if (mode === 'db-error') {
        return jsonResponse({ message: 'permission denied', code: '42501' }, 403)
      }
      return jsonResponse([{ id: 'applicant-1' }])
    }
    return jsonResponse([APPLICANT])
  }
  return createClient<Database>('http://127.0.0.1:54321', 'test-anon-key', {
    global: { fetch: fetchImpl },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

describe('refreshApplicantIdentityStatus outcomes', () => {
  beforeEach(() => {
    authState.user = { id: 'admin-1' }
    authState.role = 'admin'
    stripeState.mode = 'verified'
    adminClients.length = 0
  })

  it('reports Stripe retrieval failure without provider details', async () => {
    stripeState.mode = 'throw'
    adminClients.push(adminClient('ok'))

    const result = await refreshApplicantIdentityStatus('applicant-1')

    expect(result).toEqual({ error: 'Could not refresh identity status.' })
    expect(result.error).not.toContain('vs_secret_session')
  })

  it('reports a failed conditional update without database details', async () => {
    adminClients.push(adminClient('db-error'))

    const result = await refreshApplicantIdentityStatus('applicant-1')

    expect(result).toEqual({ error: 'Could not refresh identity status.' })
    expect(result.error).not.toContain('42501')
    expect(result.error).not.toContain('permission denied')
  })

  it('reports success when the refresh commits', async () => {
    adminClients.push(adminClient('ok'))

    const result = await refreshApplicantIdentityStatus('applicant-1')

    expect(result).toEqual({ error: null })
  })
})
