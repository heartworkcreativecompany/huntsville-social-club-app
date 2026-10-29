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
const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = []
let rpcError: { message: string } | null = null
let rpcData: unknown = { id: 'row-1', already_verified: false }

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
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args })
      return { data: rpcError ? null : rpcData, error: rpcError }
    },
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

describe('in-person identity server actions', () => {
  beforeEach(() => {
    authState.user = { id: 'admin-session' }
    authState.role = 'admin'
    adminClient.mockReset()
    revalidatePath.mockReset()
    rpcCalls.length = 0
    rpcError = null
    rpcData = { id: 'row-1', already_verified: false }
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

  it('records through the session client and ignores an unconfirmed request', async () => {
    const { client, calls } = createClient({
      profiles: [{ data: { id: 'member-2' }, error: null }],
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
    expect(rpcCalls).toHaveLength(0)

    const result = await approveInPersonIdentityVerification('member-2', true)
    expect(result).toEqual({ success: true, alreadyVerified: false })
    expect(rpcCalls).toEqual([
      {
        fn: 'record_in_person_identity_verification',
        args: { target_profile_id: 'member-2', confirmed: true },
      },
    ])
    expect(rpcCalls[0]?.args).not.toHaveProperty('actor_id')
    expect(rpcCalls[0]?.args).not.toHaveProperty('approved_by')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/users/member-2')
  })

  it('does not refresh when the atomic write fails', async () => {
    const { client } = createClient({
      profiles: [{ data: { id: 'member-2' }, error: null }],
    })
    adminClient.mockReturnValue(client)
    rpcError = { message: 'forced audit failure' }
    const { approveInPersonIdentityVerification } = await import(
      '@/app/(club)/admin/applications/identity-actions'
    )
    await expect(
      approveInPersonIdentityVerification('member-2', true)
    ).resolves.toEqual({
      error: 'Could not record in-person identity verification.',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('revokes through the session client without an actor argument', async () => {
    const { client, calls } = createClient({
      profiles: [{ data: { id: 'member-2' }, error: null }],
    })
    adminClient.mockReturnValue(client)
    const { revokeInPersonIdentityVerification } = await import(
      '@/app/(club)/admin/applications/identity-actions'
    )

    await expect(
      revokeInPersonIdentityVerification('member-2', '   ')
    ).resolves.toEqual({ error: 'A revocation reason is required.' })
    expect(calls).toHaveLength(0)
    expect(rpcCalls).toHaveLength(0)

    const result = await revokeInPersonIdentityVerification(
      'member-2',
      'Wrong member was checked.'
    )
    expect(result).toEqual({ success: true })
    expect(rpcCalls).toEqual([
      {
        fn: 'revoke_in_person_identity_verification',
        args: {
          target_profile_id: 'member-2',
          reason: 'Wrong member was checked.',
        },
      },
    ])
    expect(rpcCalls[0]?.args).not.toHaveProperty('actor_id')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/users/member-2')
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
