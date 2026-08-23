import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  awardRecognitionBadges,
  denyNonAdminBadgeAccess,
  loadAdminMemberBadges,
  revokeRecognitionBadge,
} from '@/lib/recognition-badges/admin'
import {
  ADMIN_NOT_AUTHORIZED_ERROR,
  RECOGNITION_BADGE_SLUGS,
  SEEDED_RECOGNITION_BADGES,
} from '@/lib/recognition-badges/catalog'

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
  query.order = chain
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

function createClient(
  results: Record<string, QueryResult[]>
): {
  client: SupabaseClient<Database>
  calls: TableCall[]
} {
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

const catalogRows = SEEDED_RECOGNITION_BADGES.map((badge) => ({
  slug: badge.slug,
  public_label: badge.publicLabel,
  public_description: badge.publicDescription,
  display_order: badge.displayOrder,
  active: true,
}))

function auditCalls(calls: TableCall[]) {
  return calls.filter((call) => call.table === 'moderation_actions')
}

describe('admin recognition badge authorization', () => {
  it('rejects non-admins without querying', async () => {
    expect(denyNonAdminBadgeAccess(false)).toBe(ADMIN_NOT_AUTHORIZED_ERROR)
    const from = vi.fn()
    const result = await loadAdminMemberBadges(
      { from } as unknown as SupabaseClient<Database>,
      { isAdmin: false, memberId: 'member-1' }
    )
    expect(result).toEqual({ ok: false, error: ADMIN_NOT_AUTHORIZED_ERROR })
    expect(from).not.toHaveBeenCalled()

    const award = await awardRecognitionBadges(
      { from } as unknown as SupabaseClient<Database>,
      {
        isAdmin: false,
        actorId: 'member-1',
        memberId: 'member-1',
        slugs: ['founding_member'],
      }
    )
    expect(award).toEqual({ ok: false, error: ADMIN_NOT_AUTHORIZED_ERROR })

    const revoke = await revokeRecognitionBadge(
      { from } as unknown as SupabaseClient<Database>,
      {
        isAdmin: false,
        actorId: 'member-1',
        memberId: 'member-1',
        slug: 'founding_member',
      }
    )
    expect(revoke).toEqual({ ok: false, error: ADMIN_NOT_AUTHORIZED_ERROR })
    expect(from).not.toHaveBeenCalled()
  })
})

describe('admin recognition badge mutations', () => {
  it('awards each seeded catalog badge and writes an audit event', async () => {
    const { client, calls } = createClient({
      recognition_badges: [{ data: catalogRows, error: null }],
      member_recognition_badge_awards: [
        { data: [], error: null },
        { data: [{ id: 'award-1' }], error: null },
        { data: [{ id: 'award-2' }], error: null },
        { data: [{ id: 'award-3' }], error: null },
      ],
      moderation_actions: [
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
      ],
    })

    const result = await awardRecognitionBadges(client, {
      isAdmin: true,
      actorId: 'admin-1',
      memberId: 'member-1',
      slugs: [...RECOGNITION_BADGE_SLUGS],
      adminNote: 'Private sponsor packet',
    })

    expect(result).toEqual({
      ok: true,
      awarded: [...RECOGNITION_BADGE_SLUGS],
      alreadyAwarded: [],
    })
    const awardInserts = calls
      .filter((call) => call.table === 'member_recognition_badge_awards')
      .flatMap((call) => call.inserts)
    expect(awardInserts).toHaveLength(3)
    expect(awardInserts).toEqual(
      RECOGNITION_BADGE_SLUGS.map((slug) => ({
        user_id: 'member-1',
        badge_slug: slug,
        awarded_by: 'admin-1',
        admin_note: 'Private sponsor packet',
      }))
    )
    expect(auditCalls(calls)).toHaveLength(3)
    expect(auditCalls(calls)[0]?.inserts[0]).toMatchObject({
      actor_id: 'admin-1',
      target_member_id: 'member-1',
      action_type: 'recognition_badge_awarded',
      source_type: 'recognition_badge',
      source_id: 'founding_member',
    })
  })

  it('treats a duplicate active award as idempotent and does not write another audit', async () => {
    const { client, calls } = createClient({
      recognition_badges: [{ data: catalogRows, error: null }],
      member_recognition_badge_awards: [
        { data: [{ badge_slug: 'founding_member' }], error: null },
      ],
    })

    const result = await awardRecognitionBadges(client, {
      isAdmin: true,
      actorId: 'admin-1',
      memberId: 'member-1',
      slugs: ['founding_member'],
      adminNote: 'Retry',
    })

    expect(result).toEqual({
      ok: true,
      awarded: [],
      alreadyAwarded: ['founding_member'],
    })
    expect(
      calls
        .filter((call) => call.table === 'member_recognition_badge_awards')
        .flatMap((call) => call.inserts)
    ).toHaveLength(0)
    expect(auditCalls(calls)).toHaveLength(0)
  })

  it('treats a unique-index collision as an already-awarded success', async () => {
    const { client, calls } = createClient({
      recognition_badges: [{ data: catalogRows, error: null }],
      member_recognition_badge_awards: [
        { data: [], error: null },
        { data: null, error: { code: '23505', message: 'duplicate key' } },
      ],
    })

    const result = await awardRecognitionBadges(client, {
      isAdmin: true,
      actorId: 'admin-1',
      memberId: 'member-1',
      slugs: ['premium_sponsor'],
    })

    expect(result).toEqual({
      ok: true,
      awarded: [],
      alreadyAwarded: ['premium_sponsor'],
    })
    expect(auditCalls(calls)).toHaveLength(0)
  })

  it('revokes an active badge and writes an audit event', async () => {
    const { client, calls } = createClient({
      recognition_badges: [
        {
          data: {
            slug: 'experience_partner',
            public_label: 'Experience Partner',
          },
          error: null,
        },
      ],
      member_recognition_badge_awards: [{ data: [{ id: 'award-3' }], error: null }],
      moderation_actions: [{ data: null, error: null }],
    })

    const result = await revokeRecognitionBadge(client, {
      isAdmin: true,
      actorId: 'admin-1',
      memberId: 'member-1',
      slug: 'experience_partner',
    })

    expect(result).toEqual({ ok: true, revoked: true })
    expect(
      calls.find((call) => call.table === 'member_recognition_badge_awards')?.updates[0]
    ).toMatchObject({
      revoked_by: 'admin-1',
    })
    expect(auditCalls(calls)[0]?.inserts[0]).toMatchObject({
      action_type: 'recognition_badge_revoked',
      source_id: 'experience_partner',
      source_type: 'recognition_badge',
    })
  })

  it('is idempotent when the badge is already revoked', async () => {
    const { client, calls } = createClient({
      recognition_badges: [
        {
          data: { slug: 'founding_member', public_label: 'Founding Member' },
          error: null,
        },
      ],
      member_recognition_badge_awards: [{ data: [], error: null }],
    })

    const result = await revokeRecognitionBadge(client, {
      isAdmin: true,
      actorId: 'admin-1',
      memberId: 'member-1',
      slug: 'founding_member',
    })

    expect(result).toEqual({ ok: true, revoked: false })
    expect(auditCalls(calls)).toHaveLength(0)
  })
})
