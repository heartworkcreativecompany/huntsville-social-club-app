import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  grantMembershipAccessOverride,
  loadMembershipAccessOverrideForUser,
  revokeMembershipAccessOverride,
} from '@/lib/membership-access-override/admin'
import { ADMIN_NOT_AUTHORIZED_ERROR } from '@/lib/membership-access-override'

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
  query.in = chain
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

function auditCalls(calls: TableCall[]) {
  return calls.filter((call) => call.table === 'moderation_actions')
}

describe('admin membership access override authorization', () => {
  it('rejects non-admins without querying', async () => {
    const from = () => ({})
    const calls: unknown[] = []
    const tracked = (...args: unknown[]) => {
      calls.push(args)
      return from()
    }

    const load = await loadMembershipAccessOverrideForUser(
      { from: tracked } as unknown as SupabaseClient<Database>,
      { isAdmin: false, memberId: 'member-1' }
    )
    expect(load).toEqual({ ok: false, error: ADMIN_NOT_AUTHORIZED_ERROR })

    const grant = await grantMembershipAccessOverride(
      { from: tracked } as unknown as SupabaseClient<Database>,
      {
        isAdmin: false,
        actorId: 'member-1',
        memberId: 'member-1',
        tier: 'inner_circle',
      }
    )
    expect(grant).toEqual({ ok: false, error: ADMIN_NOT_AUTHORIZED_ERROR })

    const revoke = await revokeMembershipAccessOverride(
      { from: tracked } as unknown as SupabaseClient<Database>,
      { isAdmin: false, actorId: 'member-1', memberId: 'member-1' }
    )
    expect(revoke).toEqual({ ok: false, error: ADMIN_NOT_AUTHORIZED_ERROR })
    expect(calls).toHaveLength(0)
  })
})

describe('admin membership access override mutations', () => {
  it('grants an override and writes an audit event', async () => {
    const { client, calls } = createClient({
      membership_access_overrides: [
        { data: null, error: null },
        { data: { id: 'override-1' }, error: null },
      ],
      moderation_actions: [{ data: null, error: null }],
    })

    const result = await grantMembershipAccessOverride(client, {
      isAdmin: true,
      actorId: 'admin-1',
      memberId: 'member-1',
      tier: 'elite_circle',
      reason: 'Founding year courtesy',
    })

    expect(result).toEqual({
      ok: true,
      granted: true,
      updated: false,
      alreadyActive: false,
    })
    expect(
      calls
        .filter((call) => call.table === 'membership_access_overrides')
        .flatMap((call) => call.inserts)[0]
    ).toMatchObject({
      user_id: 'member-1',
      tier: 'elite_circle',
      granted_by: 'admin-1',
      reason: 'Founding year courtesy',
    })
    expect(auditCalls(calls)[0]?.inserts[0]).toMatchObject({
      action_type: 'membership_access_override_granted',
      target_member_id: 'member-1',
      source_type: 'membership_access_override',
    })
  })

  it('is idempotent when the same active override is submitted again', async () => {
    const { client, calls } = createClient({
      membership_access_overrides: [
        {
          data: {
            id: 'override-1',
            user_id: 'member-1',
            tier: 'inner_circle',
            starts_at: '2026-01-01T00:00:00.000Z',
            expires_at: null,
            reason: 'Courtesy',
            granted_by: 'admin-1',
            revoked_at: null,
            revoked_by: null,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
          error: null,
        },
      ],
    })

    const result = await grantMembershipAccessOverride(client, {
      isAdmin: true,
      actorId: 'admin-1',
      memberId: 'member-1',
      tier: 'inner_circle',
      reason: 'Courtesy',
    })

    expect(result).toEqual({
      ok: true,
      granted: false,
      updated: false,
      alreadyActive: true,
    })
    expect(auditCalls(calls)).toHaveLength(0)
  })

  it('updates an existing override and writes an update audit', async () => {
    const { client, calls } = createClient({
      membership_access_overrides: [
        {
          data: {
            id: 'override-1',
            user_id: 'member-1',
            tier: 'inner_circle',
            starts_at: '2026-01-01T00:00:00.000Z',
            expires_at: null,
            reason: 'Courtesy',
            granted_by: 'admin-1',
            revoked_at: null,
            revoked_by: null,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
          error: null,
        },
        { data: { id: 'override-1' }, error: null },
      ],
      moderation_actions: [{ data: null, error: null }],
    })

    const result = await grantMembershipAccessOverride(client, {
      isAdmin: true,
      actorId: 'admin-1',
      memberId: 'member-1',
      tier: 'elite_circle',
      reason: 'Upgrade courtesy',
    })

    expect(result).toEqual({
      ok: true,
      granted: false,
      updated: true,
      alreadyActive: false,
    })
    expect(auditCalls(calls)[0]?.inserts[0]).toMatchObject({
      action_type: 'membership_access_override_updated',
    })
  })

  it('revokes an active override and writes an audit event', async () => {
    const { client, calls } = createClient({
      membership_access_overrides: [
        {
          data: [
            {
              id: 'override-1',
              tier: 'inner_circle',
              starts_at: '2026-01-01T00:00:00.000Z',
              expires_at: null,
              reason: 'Courtesy',
            },
          ],
          error: null,
        },
      ],
      moderation_actions: [{ data: null, error: null }],
    })

    const result = await revokeMembershipAccessOverride(client, {
      isAdmin: true,
      actorId: 'admin-1',
      memberId: 'member-1',
    })

    expect(result).toEqual({ ok: true, revoked: true })
    expect(
      calls.find((call) => call.table === 'membership_access_overrides')?.updates[0]
    ).toMatchObject({
      revoked_by: 'admin-1',
    })
    expect(auditCalls(calls)[0]?.inserts[0]).toMatchObject({
      action_type: 'membership_access_override_revoked',
    })
  })

  it('is idempotent when no active override exists', async () => {
    const { client, calls } = createClient({
      membership_access_overrides: [{ data: [], error: null }],
    })

    const result = await revokeMembershipAccessOverride(client, {
      isAdmin: true,
      actorId: 'admin-1',
      memberId: 'member-1',
    })

    expect(result).toEqual({ ok: true, revoked: false })
    expect(auditCalls(calls)).toHaveLength(0)
  })
})
