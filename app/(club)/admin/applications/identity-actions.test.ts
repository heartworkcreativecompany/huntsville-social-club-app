import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

vi.mock('server-only', () => ({}))

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}))

const authState: {
  user: { id: string } | null
  role: string | null
} = {
  user: { id: 'admin-session' },
  role: 'admin',
}

const adminClient = vi.fn()

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

type QueryResult = {
  data?: unknown
  error?: { code?: string; message?: string } | null
}

type TableCall = {
  table: string
  inserts: unknown[]
  updates: unknown[]
}

function createQuery(result: QueryResult, call: TableCall) {
  const query: Record<string, unknown> = {}
  const chain = () => query
  query.select = chain
  query.eq = chain
  query.is = chain
  query.maybeSingle = async () => result
  query.single = async () => result
  query.insert = (payload: unknown) => {
    call.inserts.push(payload)
    return query
  }
  query.update = (payload: unknown) => {
    call.updates.push(payload)
    return query
  }
  query.then = (resolve: (value: QueryResult) => unknown) =>
    Promise.resolve(result).then(resolve)
  return query
}

function createClient(results: Record<string, QueryResult[]>) {
  const unused: Record<string, QueryResult[]> = Object.fromEntries(
    Object.entries(results).map(([table, queue]) => [table, [...queue]])
  )
  const calls: TableCall[] = []
  return {
    calls,
    client: {
      from(table: string) {
        const queue = unused[table] ?? []
        const next = queue.shift() ?? { data: null, error: null }
        const call: TableCall = { table, inserts: [], updates: [] }
        calls.push(call)
        return createQuery(next, call)
      },
    } as unknown as SupabaseClient<Database>,
  }
}

const activeRow = {
  id: 'row-1',
  source: 'admin_action',
  approved_by: 'admin-session',
  approved_at: '2026-10-01T00:00:00.000Z',
  reconciled_at: null,
  note: null,
  status: 'verified',
  revoked_at: null,
}

describe('in-person identity server actions', () => {
  beforeEach(() => {
    authState.user = { id: 'admin-session' }
    authState.role = 'admin'
    adminClient.mockReset()
    revalidatePath.mockReset()
  })

  it('denies a signed-out caller before any write', async () => {
    authState.user = null
    const { approveInPersonIdentityVerification, revokeInPersonIdentityVerification } =
      await import('@/app/(club)/admin/applications/identity-actions')

    await expect(
      approveInPersonIdentityVerification('member-2', true)
    ).resolves.toEqual({ error: 'Administrator access required.' })
    await expect(
      revokeInPersonIdentityVerification('member-2', 'Wrong member')
    ).resolves.toEqual({ error: 'Administrator access required.' })
    expect(adminClient).not.toHaveBeenCalled()
  })

  it('denies a signed-in member, including a direct call', async () => {
    authState.user = { id: 'member-1' }
    authState.role = 'member'
    const { approveInPersonIdentityVerification, revokeInPersonIdentityVerification } =
      await import('@/app/(club)/admin/applications/identity-actions')

    await expect(
      approveInPersonIdentityVerification('member-1', true)
    ).resolves.toEqual({ error: 'Administrator access required.' })
    await expect(
      revokeInPersonIdentityVerification('member-2', 'Wrong member')
    ).resolves.toEqual({ error: 'Administrator access required.' })
    expect(adminClient).not.toHaveBeenCalled()
  })

  it('records with the session admin and ignores an unconfirmed request', async () => {
    const { client, calls } = createClient({
      profiles: [{ data: { id: 'member-2' }, error: null }],
      in_person_identity_verifications: [
        { data: null, error: null },
        { data: { id: 'row-1' }, error: null },
      ],
      moderation_actions: [{ data: null, error: null }],
    })
    adminClient.mockReturnValue(client)
    const { approveInPersonIdentityVerification } = await import(
      '@/app/(club)/admin/applications/identity-actions'
    )

    await expect(
      approveInPersonIdentityVerification('member-2', false)
    ).resolves.toEqual({
      error: 'Confirm the in-person identity check before recording it.',
    })
    expect(calls).toHaveLength(0)

    const result = await approveInPersonIdentityVerification('member-2', true)
    expect(result).toEqual({ success: true, alreadyVerified: false })
    const insert = calls
      .filter((call) => call.table === 'in_person_identity_verifications')
      .flatMap((call) => call.inserts)[0] as Record<string, unknown>
    expect(insert.approved_by).toBe('admin-session')
    expect(insert.note).toBeNull()
    expect(insert).not.toHaveProperty('application_status')
    expect(insert).not.toHaveProperty('messaging_suspended_at')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/users/member-2')
  })

  it('revokes with the session admin and keeps the row', async () => {
    const { client, calls } = createClient({
      profiles: [{ data: { id: 'member-2' }, error: null }],
      in_person_identity_verifications: [
        { data: activeRow, error: null },
        { data: { id: 'row-1' }, error: null },
      ],
      moderation_actions: [{ data: null, error: null }],
    })
    adminClient.mockReturnValue(client)
    const { revokeInPersonIdentityVerification } = await import(
      '@/app/(club)/admin/applications/identity-actions'
    )

    await expect(
      revokeInPersonIdentityVerification('member-2', '   ')
    ).resolves.toEqual({ error: 'A revocation reason is required.' })
    expect(calls).toHaveLength(0)

    const result = await revokeInPersonIdentityVerification(
      'member-2',
      'Wrong member was checked.'
    )
    expect(result).toEqual({ success: true })
    const update = calls.find(
      (call) =>
        call.table === 'in_person_identity_verifications' &&
        call.updates.length > 0
    )?.updates[0] as Record<string, unknown>
    expect(update).toMatchObject({
      status: 'revoked',
      revoked_by: 'admin-session',
    })
    const audit = calls.find((call) => call.table === 'moderation_actions')
      ?.inserts[0] as Record<string, unknown>
    expect(audit.actor_id).toBe('admin-session')
    expect(audit.reason).toBe('Wrong member was checked.')
    expect(calls.some((call) => call.inserts.length > 0 && call.table === 'in_person_identity_verifications')).toBe(false)
  })

  it('does not record a missing member', async () => {
    const { client, calls } = createClient({
      profiles: [{ data: null, error: null }],
    })
    adminClient.mockReturnValue(client)
    const { approveInPersonIdentityVerification } = await import(
      '@/app/(club)/admin/applications/identity-actions'
    )

    await expect(
      approveInPersonIdentityVerification('missing-member', true)
    ).resolves.toEqual({ error: 'Member not found.' })
    expect(
      calls.some((call) => call.table === 'in_person_identity_verifications')
    ).toBe(false)
  })

  it('does not approve membership, change suspension, or overwrite Stripe', () => {
    const source = readFileSync(
      'app/(club)/admin/applications/identity-actions.ts',
      'utf8'
    )
    expect(source).toContain('return user.id')
    expect(source).not.toContain('application_status')
    expect(source).not.toContain('messaging_suspended')
    expect(source).not.toContain('identity_verification_status')
    expect(source).not.toContain('membership_billing')
    const memberPage = readFileSync(
      'app/(club)/admin/users/[id]/page.tsx',
      'utf8'
    )
    expect(memberPage).toContain('AdminInPersonIdentityVerification')
    expect(memberPage).toContain('acceptedIdentityForAdmin')
  })
})
