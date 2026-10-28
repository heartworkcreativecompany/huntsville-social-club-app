import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import AdminCuratedIntroQueue from '@/components/admin/admin-curated-intro-queue'
import {
  historicalIntroKindLabel,
  historicalIntroStatusLabel,
  isHistoricalStaffIntroKind,
  loadCuratedIntroQueue,
  type CuratedIntroQueueItem,
} from '@/lib/load-curated-intro-queue'
import {
  acceptMessageRequest,
  declineMessageRequest,
} from '@/lib/message-request-flow'
import {
  declineCuratedIntroRequest,
  matchCuratedIntroRequest,
} from '@/lib/curated-intro-admin'
import type { Database } from '@/lib/database.types'

const REQUESTER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TARGET = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

type QueryState = {
  action: 'select' | 'insert' | 'update'
  filters: Array<[string, unknown]>
  payload: unknown
}

function thenable(
  result: { data: unknown; error: { message: string; code?: string } | null }
) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    insert: () => builder,
    update: () => builder,
    eq: () => builder,
    in: () => builder,
    is: () => builder,
    or: () => builder,
    order: () => builder,
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    then: (
      onFulfilled: (value: typeof result) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  }
  return builder
}

describe('historical staff intro queue', () => {
  it('keeps staff and legacy kinds and excludes ongoing member requests', () => {
    expect(isHistoricalStaffIntroKind('curated')).toBe(true)
    expect(isHistoricalStaffIntroKind(null)).toBe(true)
    expect(isHistoricalStaffIntroKind(undefined)).toBe(true)
    expect(isHistoricalStaffIntroKind('')).toBe(true)
    expect(isHistoricalStaffIntroKind('legacy')).toBe(true)
    expect(isHistoricalStaffIntroKind('member')).toBe(false)
  })

  it('loads curated and null-kind rows, including those without a recommendation', async () => {
    const calls: string[] = []
    const rows = [
      row('member-pending', 'member', 'pending', 'rec-live'),
      row('curated-pending', 'curated', 'pending', null),
      row('curated-matched', 'curated', 'matched', 'rec-old'),
      row('legacy-null', null, 'declined', null),
      row('legacy-blank', '', 'closed', null),
      row('legacy-other', 'concierge', 'accepted', null),
    ]
    const client = {
      from(table: string) {
        const builder = {
          select: () => builder,
          or: (filter: string) => {
            calls.push(filter)
            return builder
          },
          not: () => {
            calls.push('not')
            return builder
          },
          order: () => builder,
          eq: () => builder,
          in: () => builder,
          then: (
            onFulfilled: (value: { data: unknown; error: null }) => unknown
          ) =>
            Promise.resolve({
              data: table === 'member_intro_requests' ? rows : [],
              error: null,
            }).then(onFulfilled),
        }
        return builder
      },
    }

    const loaded = await loadCuratedIntroQueue(
      client as unknown as SupabaseClient<Database>
    )

    expect(calls).toContain('kind.is.null,kind.neq.member')
    expect(calls).not.toContain('not')
    expect(loaded.error).toBeNull()
    expect(loaded.items.map((item) => item.id)).toEqual([
      'curated-pending',
      'curated-matched',
      'legacy-null',
      'legacy-blank',
      'legacy-other',
    ])
    expect(loaded.items.find((item) => item.id === 'curated-pending')?.recommendationId).toBeNull()
  })

  it('renders pending, accepted, declined, and closed staff records', () => {
    const items: CuratedIntroQueueItem[] = [
      item('pending', 'curated', 'pending'),
      item('matched', 'curated', 'matched'),
      item('accepted', null, 'accepted'),
      item('declined', 'curated', 'declined'),
      item('closed', '', 'closed'),
    ]
    const html = renderToStaticMarkup(
      createElement(AdminCuratedIntroQueue, { items })
    )

    expect(html).toContain(historicalIntroStatusLabel('pending'))
    expect(html).toContain('Accepted')
    expect(html).toContain(historicalIntroStatusLabel('declined'))
    expect(html).toContain(historicalIntroStatusLabel('closed'))
    expect(html).toContain(historicalIntroKindLabel('curated'))
    expect(html).toContain(historicalIntroKindLabel(null))
    expect(html).toContain('No recommendation')
    expect(html).not.toContain('Awaiting recipient')
    expect(html).not.toContain('<form')
    expect(html).not.toContain('>Approve<')
    expect(html).not.toContain('>Decline<')
  })
})

describe('member accept and decline stay independent of staff review', () => {
  it('updates the member intro row when the recipient accepts or declines', async () => {
    const writes: Array<{ table: string; payload: unknown }> = []
    const client = messagingClient({
      writes,
      conversation: {
        id: 'conversation-1',
        participant_a: REQUESTER,
        participant_b: TARGET,
        status: 'pending',
        initiated_by: REQUESTER,
        recommendation_id: 'recommendation-1',
        recontact_status: null,
      },
    })

    const accepted = await acceptMessageRequest(client, {
      responderId: TARGET,
      conversationId: 'conversation-1',
    })
    expect(accepted.ok).toBe(true)
    expect(writes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'member_conversations',
          payload: expect.objectContaining({ status: 'accepted' }),
        }),
        expect.objectContaining({
          table: 'member_intro_requests',
          payload: expect.objectContaining({ status: 'matched' }),
        }),
      ])
    )

    writes.length = 0
    const declined = await declineMessageRequest(client, {
      responderId: TARGET,
      conversationId: 'conversation-1',
    })
    expect(declined.ok).toBe(true)
    expect(writes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'member_conversations',
          payload: expect.objectContaining({ status: 'declined' }),
        }),
        expect.objectContaining({
          table: 'member_intro_requests',
          payload: expect.objectContaining({ status: 'declined' }),
        }),
      ])
    )
  })

  it('does not call retired staff review while members respond', async () => {
    const flow = readFileSync(
      join(__dirname, 'message-request-flow.ts'),
      'utf8'
    )
    const actions = readFileSync(
      join(__dirname, '../app/(club)/messages/actions.ts'),
      'utf8'
    )
    expect(flow).not.toContain('matchCuratedIntroRequest')
    expect(flow).not.toContain('declineCuratedIntroRequest')
    expect(actions).toContain('acceptMessageRequest(')
    expect(actions).toContain('declineMessageRequest(')
    expect(actions).not.toContain('matchCuratedIntroRequest')

    let queried = false
    const staffClient = new Proxy(
      {},
      {
        get() {
          queried = true
          throw new Error('staff review must not query')
        },
      }
    ) as SupabaseClient<Database>
    expect(
      await matchCuratedIntroRequest(staffClient, 'historical-request')
    ).toMatchObject({ ok: false })
    expect(
      await declineCuratedIntroRequest(staffClient, 'historical-request')
    ).toMatchObject({ ok: false })
    expect(queried).toBe(false)
  })
})

function row(
  id: string,
  kind: string | null,
  status: string,
  recommendationId: string | null
) {
  return {
    id,
    status,
    kind,
    created_at: '2026-10-01T00:00:00.000Z',
    note: null,
    admin_notes: null,
    requester_id: REQUESTER,
    target_member_id: TARGET,
    recommendation_id: recommendationId,
    conversation_id: null,
  }
}

function item(
  id: string,
  kind: string | null,
  status: string
): CuratedIntroQueueItem {
  return {
    id,
    status,
    kind,
    createdAt: '2026-10-01T00:00:00.000Z',
    memberNote: null,
    adminNotes: null,
    recommendationId: id === 'pending' ? null : 'rec-1',
    conversationId: null,
    compatibilityScore: null,
    recommendationStatus: null,
    requester: { id: REQUESTER, name: 'Requester', email: null },
    target: { id: TARGET, name: 'Recipient', email: null },
  }
}

function messagingClient(input: {
  writes: Array<{ table: string; payload: unknown }>
  conversation: Record<string, unknown>
}): SupabaseClient<Database> {
  return {
    from(table: string) {
      const state: QueryState = {
        action: 'select',
        filters: [],
        payload: null,
      }
      const builder = {
        select: () => builder,
        insert: (payload: unknown) => {
          state.action = 'insert'
          state.payload = payload
          return builder
        },
        update: (payload: unknown) => {
          state.action = 'update'
          state.payload = payload
          input.writes.push({ table, payload })
          return builder
        },
        eq: (column: string, value: unknown) => {
          state.filters.push([column, value])
          return builder
        },
        in: () => builder,
        is: () => builder,
        or: () => builder,
        order: () => builder,
        maybeSingle: () => Promise.resolve(resultFor(table, state, input.conversation)),
        single: () => Promise.resolve(resultFor(table, state, input.conversation)),
        then: (
          onFulfilled: (value: { data: unknown; error: null }) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) =>
          Promise.resolve(resultFor(table, state, input.conversation)).then(
            onFulfilled,
            onRejected
          ),
      }
      return builder
    },
  } as unknown as SupabaseClient<Database>
}

function resultFor(
  table: string,
  state: QueryState,
  conversation: Record<string, unknown>
) {
  if (state.action === 'update' || state.action === 'insert') {
    return { data: { id: conversation.id }, error: null }
  }
  if (table === 'member_conversations') {
    return { data: conversation, error: null }
  }
  if (table === 'member_profiles') {
    return {
      data: [REQUESTER, TARGET].map((id) => ({
        id,
        application_status: 'approved',
        messaging_suspended_at: null,
      })),
      error: null,
    }
  }
  if (table === 'member_member_blocks') {
    return { data: [], error: null }
  }
  if (table === 'profiles') {
    return {
      data: { identity_verification_status: 'verified' },
      error: null,
    }
  }
  if (table === 'in_person_identity_verifications') {
    return { data: null, error: null }
  }
  return { data: null, error: null }
}
