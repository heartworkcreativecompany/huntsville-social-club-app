import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const authState: {
  user: { id: string } | null
  role: string | null
} = {
  user: { id: 'member-1' },
  role: 'member',
}

const adminClient = vi.fn()
const reconcile = vi.fn()

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
vi.mock('@/lib/supabase/require-admin-client', () => ({
  requireAdminClient: () => adminClient(),
}))
vi.mock('@/lib/stripe/identity', () => ({
  reconcileIdentityVerification: (...args: unknown[]) => reconcile(...args),
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

describe('refreshApplicantIdentityStatus authorization', () => {
  beforeEach(() => {
    authState.user = { id: 'member-1' }
    authState.role = 'member'
    adminClient.mockReset()
    reconcile.mockReset()
  })

  it('rejects a non-admin without refreshing identity status', async () => {
    const result = await refreshApplicantIdentityStatus('applicant-1')

    expect(result).toEqual({ error: 'Administrator access required.' })
    expect(adminClient).not.toHaveBeenCalled()
    expect(reconcile).not.toHaveBeenCalled()
  })

  it('rejects a signed-out caller', async () => {
    authState.user = null
    authState.role = null

    const result = await refreshApplicantIdentityStatus('applicant-1')

    expect(result).toEqual({ error: 'You must be signed in.' })
    expect(adminClient).not.toHaveBeenCalled()
    expect(reconcile).not.toHaveBeenCalled()
  })
})
