import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  approveInPersonIdentity,
  loadActiveInPersonIdentity,
  revokeInPersonIdentity,
  IN_PERSON_IDENTITY_NOT_AUTHORIZED,
} from '@/lib/identity-verification-admin'

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

describe('in-person identity admin actions', () => {
  it('rejects a non-admin without querying', async () => {
    const { client, calls } = createClient({})
    const result = await approveInPersonIdentity(client, {
      isAdmin: false,
      actorId: 'member-1',
      profileId: 'member-2',
    })
    expect(result).toEqual({
      ok: false,
      error: IN_PERSON_IDENTITY_NOT_AUTHORIZED,
    })
    expect(calls).toHaveLength(0)

    const revoked = await revokeInPersonIdentity(client, {
      isAdmin: false,
      actorId: 'member-1',
      profileId: 'member-2',
    })
    expect(revoked).toEqual({
      ok: false,
      error: IN_PERSON_IDENTITY_NOT_AUTHORIZED,
    })
  })

  it('records an admin approval without Stripe fields', async () => {
    const { client, calls } = createClient({
      in_person_identity_verifications: [
        { data: null, error: null },
        { data: { id: 'row-1' }, error: null },
      ],
      moderation_actions: [{ data: null, error: null }],
    })

    const result = await approveInPersonIdentity(client, {
      isAdmin: true,
      actorId: 'admin-1',
      profileId: 'member-2',
      note: 'Checked in person at the front desk.',
    })

    expect(result).toEqual({ ok: true, alreadyVerified: false })
    const insert = calls
      .filter((call) => call.table === 'in_person_identity_verifications')
      .flatMap((call) => call.inserts)[0] as Record<string, unknown>
    expect(insert).toMatchObject({
      profile_id: 'member-2',
      method: 'in_person',
      status: 'verified',
      source: 'admin_action',
      approved_by: 'admin-1',
      reconciled_at: null,
      note: 'Checked in person at the front desk.',
    })
    expect(insert.approved_at).toEqual(expect.any(String))
    expect(insert).not.toHaveProperty('identity_verification_status')
    expect(insert).not.toHaveProperty('identity_verification_session_id')
    const audit = calls.find((call) => call.table === 'moderation_actions')
      ?.inserts[0] as Record<string, unknown>
    expect(audit.action_type).toBe('in_person_identity_verified')
    expect(String(audit.details)).not.toContain('front desk')
  })

  it('reports partial success when the audit table is missing', async () => {
    const { client, calls } = createClient({
      in_person_identity_verifications: [
        { data: null, error: null },
        { data: { id: 'row-1' }, error: null },
      ],
      moderation_actions: [
        {
          data: null,
          error: {
            code: '42P01',
            message: 'relation "moderation_actions" does not exist',
          },
        },
      ],
    })

    const result = await approveInPersonIdentity(client, {
      isAdmin: true,
      actorId: 'admin-1',
      profileId: 'member-2',
    })

    expect(result).toEqual({
      ok: false,
      error: 'In-person verification was saved, but the audit record failed.',
    })
    expect(
      calls
        .filter((call) => call.table === 'in_person_identity_verifications')
        .flatMap((call) => call.inserts)
    ).toHaveLength(1)
  })

  it('reports partial success when a saved revocation cannot be audited', async () => {
    const { client } = createClient({
      in_person_identity_verifications: [
        {
          data: {
            id: 'row-1',
            source: 'admin_action',
            approved_by: 'admin-1',
            approved_at: '2026-10-01T00:00:00.000Z',
            reconciled_at: null,
            note: null,
            status: 'verified',
            revoked_at: null,
          },
          error: null,
        },
        { data: { id: 'row-1' }, error: null },
      ],
      moderation_actions: [
        {
          data: null,
          error: { code: '42501', message: 'permission denied for table moderation_actions' },
        },
      ],
    })

    const result = await revokeInPersonIdentity(client, {
      isAdmin: true,
      actorId: 'admin-2',
      profileId: 'member-2',
    })

    expect(result).toEqual({
      ok: false,
      error: 'In-person verification was revoked, but the audit record failed.',
    })
  })

  it('does not write another verification or audit when one is already active', async () => {
    const { client, calls } = createClient({
      in_person_identity_verifications: [
        {
          data: {
            id: 'row-1',
            source: 'admin_action',
            approved_by: 'admin-1',
            approved_at: '2026-10-01T00:00:00.000Z',
            reconciled_at: null,
            note: null,
            status: 'verified',
            revoked_at: null,
          },
          error: null,
        },
      ],
    })

    const result = await approveInPersonIdentity(client, {
      isAdmin: true,
      actorId: 'admin-2',
      profileId: 'member-2',
    })

    expect(result).toEqual({ ok: true, alreadyVerified: true })
    expect(calls.flatMap((call) => call.inserts)).toHaveLength(0)
    expect(calls.some((call) => call.table === 'moderation_actions')).toBe(false)
  })

  it('revokes in-person verification without clearing Stripe evidence', async () => {
    const { client, calls } = createClient({
      in_person_identity_verifications: [
        {
          data: {
            id: 'row-1',
            source: 'admin_action',
            approved_by: 'admin-1',
            approved_at: '2026-10-01T00:00:00.000Z',
            reconciled_at: null,
            note: null,
            status: 'verified',
            revoked_at: null,
          },
          error: null,
        },
        { data: { id: 'row-1' }, error: null },
      ],
      moderation_actions: [{ data: null, error: null }],
    })

    const result = await revokeInPersonIdentity(client, {
      isAdmin: true,
      actorId: 'admin-2',
      profileId: 'member-2',
    })

    expect(result).toEqual({ ok: true })
    const update = calls.find(
      (call) =>
        call.table === 'in_person_identity_verifications' &&
        call.updates.length > 0
    )?.updates[0] as Record<string, unknown>
    expect(update).toMatchObject({
      status: 'revoked',
      revoked_by: 'admin-2',
    })
    expect(update).not.toHaveProperty('identity_verification_status')
    const loaded = await loadActiveInPersonIdentity(client, 'member-2')
    expect(loaded).toBeNull()
  })
})
