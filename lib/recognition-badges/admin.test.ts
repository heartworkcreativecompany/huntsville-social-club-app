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
  BADGE_MUTATION_FAILED_ERROR,
  RECOGNITION_BADGE_SLUGS,
  SEEDED_RECOGNITION_BADGES,
} from '@/lib/recognition-badges/catalog'
import { uuidOrNull } from '@/lib/moderation-actions'

type QueryResult = {
  data?: unknown
  error?: { code?: string; message?: string } | null
}

type TableCall = {
  table: string
  inserts: unknown[]
  updates: unknown[]
  deletes: number
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
  query.delete = () => {
    call.deletes += 1
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
        const call: TableCall = { table, inserts: [], updates: [], deletes: 0 }
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

const MEMBER_ID = '11111111-1111-4111-8111-111111111111'
const ADMIN_ID = '22222222-2222-4222-8222-222222222222'
const AWARD_IDS = [
  '33333333-3333-4333-8333-333333333331',
  '33333333-3333-4333-8333-333333333332',
  '33333333-3333-4333-8333-333333333333',
] as const

function auditRows(calls: TableCall[]) {
  return auditCalls(calls).flatMap((call) => call.inserts) as Array<
    Record<string, unknown>
  >
}

function parseDetails(row: Record<string, unknown>) {
  return JSON.parse(String(row.details ?? '{}')) as {
    slug?: string
    public_label?: string
    has_admin_note?: boolean
    admin_note?: string
  }
}

function assertNoBadgeSlugInUuidColumns(row: Record<string, unknown>) {
  for (const slug of RECOGNITION_BADGE_SLUGS) {
    expect(row.actor_id).not.toBe(slug)
    expect(row.target_member_id).not.toBe(slug)
    expect(row.source_id).not.toBe(slug)
  }
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
  it('awards Founding Member with the member UUID as target and slug in metadata', async () => {
    const { client, calls } = createClient({
      recognition_badges: [{ data: catalogRows, error: null }],
      member_recognition_badge_awards: [
        { data: [], error: null },
        { data: [{ id: AWARD_IDS[0] }], error: null },
      ],
      moderation_actions: [{ data: null, error: null }],
    })

    const result = await awardRecognitionBadges(client, {
      isAdmin: true,
      actorId: ADMIN_ID,
      memberId: MEMBER_ID,
      slugs: ['founding_member'],
      adminNote: 'Private founding packet',
    })

    expect(result).toEqual({
      ok: true,
      awarded: ['founding_member'],
      alreadyAwarded: [],
    })
    expect(
      calls
        .filter((call) => call.table === 'member_recognition_badge_awards')
        .flatMap((call) => call.inserts)
    ).toEqual([
      {
        user_id: MEMBER_ID,
        badge_slug: 'founding_member',
        awarded_by: ADMIN_ID,
        admin_note: 'Private founding packet',
      },
    ])
    const audit = auditRows(calls)[0]
    expect(audit).toMatchObject({
      actor_id: ADMIN_ID,
      target_member_id: MEMBER_ID,
      action_type: 'recognition_badge_awarded',
      source_type: 'recognition_badge',
      source_id: AWARD_IDS[0],
    })
    assertNoBadgeSlugInUuidColumns(audit!)
    expect(parseDetails(audit!)).toEqual({
      slug: 'founding_member',
      public_label: 'Founding Member',
      has_admin_note: true,
    })
    expect(String(audit?.details)).not.toContain('Private founding packet')
  })

  it('awards each seeded catalog badge and writes an audit event', async () => {
    const { client, calls } = createClient({
      recognition_badges: [{ data: catalogRows, error: null }],
      member_recognition_badge_awards: [
        { data: [], error: null },
        { data: [{ id: AWARD_IDS[0] }], error: null },
        { data: [{ id: AWARD_IDS[1] }], error: null },
        { data: [{ id: AWARD_IDS[2] }], error: null },
      ],
      moderation_actions: [
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
      ],
    })

    const result = await awardRecognitionBadges(client, {
      isAdmin: true,
      actorId: ADMIN_ID,
      memberId: MEMBER_ID,
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
        user_id: MEMBER_ID,
        badge_slug: slug,
        awarded_by: ADMIN_ID,
        admin_note: 'Private sponsor packet',
      }))
    )
    const audits = auditRows(calls)
    expect(audits).toHaveLength(3)
    for (const [index, slug] of RECOGNITION_BADGE_SLUGS.entries()) {
      expect(audits[index]).toMatchObject({
        actor_id: ADMIN_ID,
        target_member_id: MEMBER_ID,
        action_type: 'recognition_badge_awarded',
        source_type: 'recognition_badge',
        source_id: AWARD_IDS[index],
      })
      expect(uuidOrNull(String(audits[index]?.source_id))).toBe(AWARD_IDS[index])
      assertNoBadgeSlugInUuidColumns(audits[index]!)
      expect(parseDetails(audits[index]!)).toEqual({
        slug,
        public_label: SEEDED_RECOGNITION_BADGES[index]?.publicLabel,
        has_admin_note: true,
      })
      expect(String(audits[index]?.details)).not.toContain('Private sponsor packet')
    }
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
      member_recognition_badge_awards: [{ data: [{ id: AWARD_IDS[2] }], error: null }],
      moderation_actions: [{ data: null, error: null }],
    })

    const result = await revokeRecognitionBadge(client, {
      isAdmin: true,
      actorId: ADMIN_ID,
      memberId: MEMBER_ID,
      slug: 'experience_partner',
    })

    expect(result).toEqual({ ok: true, revoked: true })
    expect(
      calls.find((call) => call.table === 'member_recognition_badge_awards')?.updates[0]
    ).toMatchObject({
      revoked_by: ADMIN_ID,
    })
    const audit = auditRows(calls)[0]
    expect(audit).toMatchObject({
      actor_id: ADMIN_ID,
      target_member_id: MEMBER_ID,
      action_type: 'recognition_badge_revoked',
      source_type: 'recognition_badge',
      source_id: AWARD_IDS[2],
    })
    assertNoBadgeSlugInUuidColumns(audit!)
    expect(parseDetails(audit!)).toEqual({
      slug: 'experience_partner',
      public_label: 'Experience Partner',
      has_admin_note: false,
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

  it('does not keep an award when audit logging fails', async () => {
    const { client, calls } = createClient({
      recognition_badges: [{ data: catalogRows, error: null }],
      member_recognition_badge_awards: [
        { data: [], error: null },
        { data: [{ id: AWARD_IDS[0] }], error: null },
        { data: null, error: null },
      ],
      moderation_actions: [
        {
          data: null,
          error: {
            message: 'invalid input syntax for type uuid: "founding_member"',
          },
        },
      ],
    })

    const result = await awardRecognitionBadges(client, {
      isAdmin: true,
      actorId: ADMIN_ID,
      memberId: MEMBER_ID,
      slugs: ['founding_member'],
    })

    expect(result).toEqual({
      ok: false,
      error: BADGE_MUTATION_FAILED_ERROR,
    })
    expect(result.ok === false && result.error).not.toContain('invalid input syntax')
    expect(result.ok === false && result.error).not.toContain('founding_member')
    expect(
      calls.filter((call) => call.table === 'member_recognition_badge_awards').at(-1)
        ?.deletes
    ).toBe(1)
  })

  it('restores the badge when revoke audit logging fails', async () => {
    const { client, calls } = createClient({
      recognition_badges: [
        {
          data: { slug: 'founding_member', public_label: 'Founding Member' },
          error: null,
        },
      ],
      member_recognition_badge_awards: [
        { data: [{ id: AWARD_IDS[0] }], error: null },
        { data: null, error: null },
      ],
      moderation_actions: [
        {
          data: null,
          error: {
            message: 'invalid input syntax for type uuid: "founding_member"',
          },
        },
      ],
    })

    const result = await revokeRecognitionBadge(client, {
      isAdmin: true,
      actorId: ADMIN_ID,
      memberId: MEMBER_ID,
      slug: 'founding_member',
    })

    expect(result).toEqual({
      ok: false,
      error: BADGE_MUTATION_FAILED_ERROR,
    })
    expect(result.ok === false && result.error).not.toContain('invalid input syntax')
    const awardCalls = calls.filter(
      (call) => call.table === 'member_recognition_badge_awards'
    )
    expect(awardCalls[0]?.updates[0]).toMatchObject({
      revoked_by: ADMIN_ID,
    })
    expect(awardCalls[1]?.updates[0]).toEqual({
      revoked_at: null,
      revoked_by: null,
    })
  })

  it('never writes a badge slug into uuid-typed audit columns', async () => {
    expect(uuidOrNull('founding_member')).toBeNull()
    expect(uuidOrNull(MEMBER_ID)).toBe(MEMBER_ID)
    for (const slug of RECOGNITION_BADGE_SLUGS) {
      expect(uuidOrNull(slug)).toBeNull()
    }
  })
})
