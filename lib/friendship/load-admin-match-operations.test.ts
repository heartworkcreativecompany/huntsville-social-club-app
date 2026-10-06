import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const loadFriendshipMatchPool = vi.fn()
const refreshFriendshipRecommendationsForAllEligible = vi.fn()
const isFriendshipMatchingEnabled = vi.fn()

vi.mock('@/lib/friendship/candidate-pool', () => ({
  loadFriendshipMatchPool: (...args: unknown[]) => loadFriendshipMatchPool(...args),
}))

vi.mock('@/lib/friendship/generate-recommendations', () => ({
  refreshFriendshipRecommendationsForAllEligible: (...args: unknown[]) =>
    refreshFriendshipRecommendationsForAllEligible(...args),
}))

vi.mock('@/lib/friendship/eligibility', async () => {
  const actual = await vi.importActual<typeof import('@/lib/friendship/eligibility')>(
    '@/lib/friendship/eligibility'
  )
  return {
    ...actual,
    isFriendshipMatchingEnabled: () => isFriendshipMatchingEnabled(),
  }
})

const generateCuratedRecommendationsForAllEligible = vi.fn()
const generateCuratedRecommendationsForUser = vi.fn()
const runScheduledCuratedMatchDelivery = vi.fn()
const notifyCuratedMatchesDelivered = vi.fn()

vi.mock('@/lib/compatibility/generate-recommendations', () => ({
  generateCuratedRecommendationsForAllEligible: (...args: unknown[]) =>
    generateCuratedRecommendationsForAllEligible(...args),
  generateCuratedRecommendationsForUser: (...args: unknown[]) =>
    generateCuratedRecommendationsForUser(...args),
}))

vi.mock('@/lib/compatibility/run-scheduled-match-delivery', () => ({
  runScheduledCuratedMatchDelivery: (...args: unknown[]) =>
    runScheduledCuratedMatchDelivery(...args),
}))

vi.mock('@/lib/curated-match-notifications', () => ({
  notifyCuratedMatchesDelivered: (...args: unknown[]) =>
    notifyCuratedMatchesDelivered(...args),
}))

import {
  FRIENDSHIP_ADMIN_HEADING,
  FRIENDSHIP_BATCH_HISTORY_NOTE,
  FRIENDSHIP_DETAILS_UNAVAILABLE_MESSAGE,
  FRIENDSHIP_EMPTY_BATCH_MESSAGE,
  FRIENDSHIP_MEMBER_NAME_FALLBACK,
  FRIENDSHIP_NO_EMAIL_COPY,
  FRIENDSHIP_REFRESH_BUTTON_LABEL,
  FRIENDSHIP_REFRESH_CONFIRMATION,
  FRIENDSHIP_REFRESH_DISABLED_COPY,
  FRIENDSHIP_UNLINKED_BATCH_MESSAGE,
  adminFriendshipOperationsLeaksSensitiveData,
  confirmedFriendshipRefresh,
  executeAdminFriendshipRefresh,
  friendshipAdminDisplayName,
  isAdminViewer,
  loadAdminFriendshipMatchOperations,
  presentFriendshipBatchDetail,
  resolveDatingDeliveryTab,
  resolveMatchOperationsProduct,
} from '@/lib/friendship/load-admin-match-operations'

type QueryResult = {
  data?: unknown
  error?: { code?: string; message?: string } | null
  count?: number | null
}

type QueryCall = {
  table: string
  select: string | null
  limit: number | null
  inFilters: { column: string; count: number }[]
}

function createQuery(result: QueryResult, call?: QueryCall) {
  const query: Record<string, unknown> = {}
  const chain = () => query
  query.select = (columns: string) => {
    if (call) call.select = columns
    return query
  }
  query.eq = chain
  query.not = chain
  query.gte = chain
  query.order = chain
  query.limit = (count: number) => {
    if (call) call.limit = count
    return query
  }
  query.in = (column: string, values: unknown[]) => {
    if (call) {
      call.inFilters.push({
        column,
        count: Array.isArray(values) ? values.length : 0,
      })
    }
    return query
  }
  query.then = (resolve: (value: QueryResult) => unknown) =>
    Promise.resolve(result).then(resolve)
  return query
}

function createClient(
  results: Record<string, QueryResult[]>,
  calls?: QueryCall[]
): SupabaseClient<Database> {
  const unused = { ...results }
  return {
    from(table: string) {
      const queue = unused[table] ?? []
      const next = queue.shift() ?? { data: [], error: null, count: 0 }
      const call: QueryCall = { table, select: null, limit: null, inFilters: [] }
      calls?.push(call)
      return createQuery(next, call)
    },
  } as unknown as SupabaseClient<Database>
}

describe('match operations product routing', () => {
  it('defaults to dating and keeps tab=history as Dating history', () => {
    expect(resolveMatchOperationsProduct(undefined)).toBe('dating')
    expect(resolveMatchOperationsProduct('dating')).toBe('dating')
    expect(resolveMatchOperationsProduct('friendship')).toBe('friendship')
    expect(resolveMatchOperationsProduct(['friendship'])).toBe('friendship')
    expect(resolveDatingDeliveryTab(undefined)).toBe('delivery')
    expect(resolveDatingDeliveryTab('history')).toBe('history')
    expect(resolveDatingDeliveryTab('delivery')).toBe('delivery')
  })
})

describe('admin Friendship match operations loader', () => {
  afterEach(() => {
    vi.clearAllMocks()
    isFriendshipMatchingEnabled.mockReturnValue(false)
  })

  it('rejects non-admin and signed-out callers before querying', async () => {
    for (const caller of ['non-admin', 'signed-out']) {
      const from = vi.fn()
      const result = await loadAdminFriendshipMatchOperations(
        { from } as unknown as SupabaseClient<Database>,
        { isAdmin: false }
      )
      expect(result, caller).toEqual({
        ok: false,
        error: 'Administrator access required.',
      })
      expect(from, caller).not.toHaveBeenCalled()
      expect(loadFriendshipMatchPool, caller).not.toHaveBeenCalled()
    }
  })

  it('returns zeros when matching is disabled and tables are missing', async () => {
    isFriendshipMatchingEnabled.mockReturnValue(false)
    loadFriendshipMatchPool.mockResolvedValue({
      profiles: [],
      error: 'Friendship tables are missing. Apply the latest database migrations.',
    })
    const client = createClient({
      friendship_questionnaires: [{ data: null, error: { code: '42P01' }, count: null }],
      friendship_match_batches: [
        { data: null, error: { code: '42P01' } },
        { data: null, error: { code: '42P01' } },
      ],
    })

    const result = await loadAdminFriendshipMatchOperations(client, { isAdmin: true })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.matchingEnabled).toBe(false)
    expect(result.data.eligiblePoolCount).toBe(0)
    expect(result.data.submittedQuestionnaireCount).toBe(0)
    expect(result.data.latestBatch).toBeNull()
    expect(result.data.recentBatches).toEqual([])
    expect(adminFriendshipOperationsLeaksSensitiveData(result.data)).toBe(false)
  })

  it('uses the canonical pool count and omits sensitive fields when enabled', async () => {
    isFriendshipMatchingEnabled.mockReturnValue(true)
    loadFriendshipMatchPool.mockResolvedValue({
      profiles: [{ id: 'member-1' }, { id: 'member-2' }, { id: 'member-3' }],
      error: null,
    })
    const calls: QueryCall[] = []
    const client = createClient(
      {
        friendship_questionnaires: [{ data: null, error: null, count: 5 }],
        friendship_match_batches: [
          {
            data: [
              {
                id: 'batch-new',
                user_id: 'recipient-1',
                created_at: '2026-08-20T12:00:00.000Z',
                status: 'delivered',
                match_count: 4,
              },
              {
                id: 'batch-old',
                user_id: 'recipient-2',
                created_at: '2026-08-19T12:00:00.000Z',
                status: 'empty',
                match_count: 0,
              },
            ],
            error: null,
          },
          {
            data: [
              { status: 'delivered', match_count: 4 },
              { status: 'empty', match_count: 0 },
            ],
            error: null,
          },
        ],
        friendship_match_recommendations: [
          {
            data: [
              {
                batch_id: 'batch-new',
                user_id: 'recipient-1',
                recommended_user_id: 'recommended-1',
                compatibility_score: 91,
                score_breakdown: { alcohol: 'often' },
                email: 'secret@example.com',
              },
            ],
            error: null,
          },
        ],
        member_profiles: [
          {
            data: [
              { id: 'recipient-1', full_name: 'Ada Quinn', email: 'ada@example.com' },
              { id: 'recipient-2', full_name: 'Grace Patel' },
              { id: 'recommended-1', full_name: 'Lin Okonkwo' },
            ],
            error: null,
          },
        ],
      },
      calls
    )

    const result = await loadAdminFriendshipMatchOperations(client, { isAdmin: true })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.matchingEnabled).toBe(true)
    expect(result.data.eligiblePoolCount).toBe(3)
    expect(result.data.submittedQuestionnaireCount).toBe(5)
    expect(result.data.latestBatch).toEqual({
      createdAt: '2026-08-20T12:00:00.000Z',
      status: 'delivered',
      recommendationCount: 4,
    })
    expect(result.data.last30Days).toEqual({
      batchCount: 2,
      deliveredCount: 1,
      emptyCount: 1,
      recommendationsWritten: 4,
    })
    expect(result.data.recentBatches).toEqual([
      {
        createdAt: '2026-08-20T12:00:00.000Z',
        status: 'delivered',
        recommendationsAtCreation: 4,
        recipientName: 'Ada Quinn',
        linked: { status: 'ready', linkedRecommendationNames: ['Lin Okonkwo'] },
      },
      {
        createdAt: '2026-08-19T12:00:00.000Z',
        status: 'empty',
        recommendationsAtCreation: 0,
        recipientName: 'Grace Patel',
        linked: { status: 'ready', linkedRecommendationNames: [] },
      },
    ])
    const delivered = presentFriendshipBatchDetail(result.data.recentBatches[0])
    expect(delivered.directionLabel).toBe('Recommended to Ada Quinn')
    expect(delivered.creationCountLabel).toBe('Recommendations at creation: 4')
    expect(delivered.linkedNames).toEqual(['Lin Okonkwo'])
    expect(delivered.linkedNames).toHaveLength(1)
    expect(delivered.directionLabel).not.toMatch(/mutual|reciprocal/i)
    expect(adminFriendshipOperationsLeaksSensitiveData(result.data)).toBe(false)
    const serialized = JSON.stringify(result.data)
    expect(serialized).not.toMatch(
      /compatibility_score|score_breakdown|alcohol|priority|billing|user_id|recommended_user_id|skipReason|@/i
    )
    expect(serialized).not.toContain('member-1')
    expect(serialized).not.toContain('recipient-1')
    expect(serialized).not.toContain('secret@example.com')
    expect(serialized).not.toContain('ada@example.com')
    expect(calls.filter((call) => call.table === 'friendship_match_recommendations')).toHaveLength(
      1
    )
    expect(calls.filter((call) => call.table === 'member_profiles')).toHaveLength(1)
    expect(calls.find((call) => call.select?.includes('user_id, created_at'))?.limit).toBe(25)
  })
})

describe('admin Friendship batch details', () => {
  afterEach(() => {
    vi.clearAllMocks()
    isFriendshipMatchingEnabled.mockReturnValue(true)
  })

  function detailClient(input: {
    batches: unknown[]
    recommendations?: QueryResult
    profiles?: QueryResult
    calls?: QueryCall[]
  }) {
    loadFriendshipMatchPool.mockResolvedValue({ profiles: [], error: null })
    return createClient(
      {
        friendship_questionnaires: [{ data: null, error: null, count: 0 }],
        friendship_match_batches: [
          { data: input.batches, error: null },
          { data: [], error: null },
        ],
        friendship_match_recommendations: [input.recommendations ?? { data: [], error: null }],
        member_profiles: [input.profiles ?? { data: [], error: null }],
      },
      input.calls
    )
  }

  const deliveredBatch = {
    id: 'batch-delivered',
    user_id: 'recipient-ada',
    created_at: '2026-10-05T15:00:00.000Z',
    status: 'delivered',
    match_count: 2,
  }

  it('shows the recipient and currently linked members directionally', async () => {
    const calls: QueryCall[] = []
    const client = detailClient({
      calls,
      batches: [
        deliveredBatch,
        {
          id: 'batch-other',
          user_id: 'recipient-grace',
          created_at: '2026-09-15T15:00:00.000Z',
          status: 'delivered',
          match_count: 1,
        },
        {
          id: 'batch-third',
          user_id: 'recipient-mina',
          created_at: '2026-09-01T15:00:00.000Z',
          status: 'delivered',
          match_count: 1,
        },
      ],
      recommendations: {
        data: [
          {
            batch_id: 'batch-delivered',
            user_id: 'recipient-ada',
            recommended_user_id: 'recommended-lin',
            compatibility_score: 88,
            score_breakdown: { answers: { alcohol: 'often' } },
          },
          {
            batch_id: 'batch-delivered',
            user_id: 'someone-else',
            recommended_user_id: 'recommended-hidden',
          },
          {
            batch_id: 'batch-other',
            user_id: 'recipient-grace',
            recommended_user_id: 'recommended-lin',
          },
        ],
        error: null,
      },
      profiles: {
        data: [
          { id: 'recipient-ada', full_name: 'Ada Quinn' },
          { id: 'recipient-grace', full_name: 'Grace Patel' },
          { id: 'recipient-mina', full_name: 'Mina Cole' },
          { id: 'recommended-lin', full_name: 'Lin Okonkwo' },
          { id: 'recommended-hidden', full_name: 'Katherine Moss' },
          { id: 'someone-else', full_name: 'Other Person' },
        ],
        error: null,
      },
    })

    const result = await loadAdminFriendshipMatchOperations(client, { isAdmin: true })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const [ada, grace] = result.data.recentBatches
    expect(ada.recommendationsAtCreation).toBe(2)
    expect(ada.linked).toEqual({
      status: 'ready',
      linkedRecommendationNames: ['Lin Okonkwo'],
    })
    const adaDetail = presentFriendshipBatchDetail(ada)
    expect(adaDetail.directionLabel).toBe('Recommended to Ada Quinn')
    expect(adaDetail.creationCountLabel).toBe('Recommendations at creation: 2')
    expect(adaDetail.linkedLabel).toBe('Currently linked recommendations')
    expect(adaDetail.linkedNames).toEqual(['Lin Okonkwo'])
    expect(adaDetail.message).toBeNull()
    expect(adaDetail.directionLabel).not.toMatch(/mutual|reciprocal/i)

    expect(grace.recipientName).toBe('Grace Patel')
    expect(presentFriendshipBatchDetail(grace).directionLabel).toBe('Recommended to Grace Patel')

    const recommendationCalls = calls.filter(
      (call) => call.table === 'friendship_match_recommendations'
    )
    const profileCalls = calls.filter((call) => call.table === 'member_profiles')
    expect(recommendationCalls).toHaveLength(1)
    expect(recommendationCalls[0]?.inFilters).toEqual([
      { column: 'batch_id', count: 3 },
    ])
    expect(recommendationCalls[0]?.select).toBe('batch_id, user_id, recommended_user_id')
    expect(profileCalls).toHaveLength(1)
    expect(profileCalls[0]?.select).toBe('id, full_name')
    expect(profileCalls[0]?.inFilters[0]?.count).toBe(4)

    const serialized = JSON.stringify(result.data)
    expect(serialized).not.toContain('Katherine Moss')
    expect(serialized).not.toContain('recipient-ada')
    expect(serialized).not.toContain('recommended-hidden')
    expect(serialized).not.toContain('someone-else')
    expect(serialized).not.toMatch(/compatibility_score|score_breakdown|alcohol|email|@/i)
    expect(adminFriendshipOperationsLeaksSensitiveData(result.data)).toBe(false)
  })

  it('uses different messages for empty batches, moved rows, and failed detail queries', async () => {
    const emptyClient = detailClient({
      batches: [
        {
          id: 'batch-empty',
          user_id: 'recipient-ada',
          created_at: '2026-09-14T15:00:00.000Z',
          status: 'empty',
          match_count: 0,
        },
      ],
      profiles: { data: [{ id: 'recipient-ada', full_name: 'Ada Quinn' }], error: null },
    })
    const emptyResult = await loadAdminFriendshipMatchOperations(emptyClient, { isAdmin: true })
    expect(emptyResult.ok).toBe(true)
    if (!emptyResult.ok) return
    const emptyDetail = presentFriendshipBatchDetail(emptyResult.data.recentBatches[0])
    expect(emptyDetail.directionLabel).toBe('Recommended to Ada Quinn')
    expect(emptyDetail.message).toBe(FRIENDSHIP_EMPTY_BATCH_MESSAGE)

    const movedClient = detailClient({
      batches: [deliveredBatch],
      recommendations: { data: [], error: null },
      profiles: { data: [{ id: 'recipient-ada', full_name: 'Ada Quinn' }], error: null },
    })
    const movedResult = await loadAdminFriendshipMatchOperations(movedClient, { isAdmin: true })
    expect(movedResult.ok).toBe(true)
    if (!movedResult.ok) return
    const movedDetail = presentFriendshipBatchDetail(movedResult.data.recentBatches[0])
    expect(movedDetail.creationCountLabel).toBe('Recommendations at creation: 2')
    expect(movedDetail.linkedNames).toEqual([])
    expect(movedDetail.message).toBe(FRIENDSHIP_UNLINKED_BATCH_MESSAGE)
    expect(movedDetail.message).not.toBe(FRIENDSHIP_EMPTY_BATCH_MESSAGE)

    const failedLinks = detailClient({
      batches: [deliveredBatch],
      recommendations: { data: null, error: { message: 'recommendation read failed' } },
      profiles: { data: [{ id: 'recipient-ada', full_name: 'Ada Quinn' }], error: null },
    })
    const failedLinksResult = await loadAdminFriendshipMatchOperations(failedLinks, {
      isAdmin: true,
    })
    expect(failedLinksResult.ok).toBe(true)
    if (!failedLinksResult.ok) return
    expect(failedLinksResult.data.recentBatches[0]?.linked).toEqual({ status: 'unavailable' })
    const failedLinksDetail = presentFriendshipBatchDetail(
      failedLinksResult.data.recentBatches[0]
    )
    expect(failedLinksDetail.directionLabel).toBe('Recommended to Ada Quinn')
    expect(failedLinksDetail.message).toBe(FRIENDSHIP_DETAILS_UNAVAILABLE_MESSAGE)
    expect(failedLinksDetail.message).not.toBe(FRIENDSHIP_EMPTY_BATCH_MESSAGE)
    expect(failedLinksDetail.message).not.toBe(FRIENDSHIP_UNLINKED_BATCH_MESSAGE)
    expect(failedLinksDetail.linkedNames).toEqual([])

    const failedNames = detailClient({
      batches: [deliveredBatch],
      recommendations: {
        data: [
          {
            batch_id: 'batch-delivered',
            user_id: 'recipient-ada',
            recommended_user_id: 'recommended-lin',
          },
        ],
        error: null,
      },
      profiles: { data: null, error: { code: '42P01', message: 'relation does not exist' } },
    })
    const failedNamesResult = await loadAdminFriendshipMatchOperations(failedNames, {
      isAdmin: true,
    })
    expect(failedNamesResult.ok).toBe(true)
    if (!failedNamesResult.ok) return
    expect(failedNamesResult.data.recentBatches[0]?.recipientName).toBeNull()
    const failedNamesDetail = presentFriendshipBatchDetail(
      failedNamesResult.data.recentBatches[0]
    )
    expect(failedNamesDetail.message).toBe(FRIENDSHIP_DETAILS_UNAVAILABLE_MESSAGE)
    expect(JSON.stringify(failedNamesResult.data)).not.toContain(FRIENDSHIP_MEMBER_NAME_FALLBACK)
    expect(JSON.stringify(failedNamesResult.data)).not.toContain('recommended-lin')
  })

  it('uses a fallback for missing names and drops restricted name values', () => {
    expect(friendshipAdminDisplayName(null)).toBe(FRIENDSHIP_MEMBER_NAME_FALLBACK)
    expect(friendshipAdminDisplayName('   ')).toBe(FRIENDSHIP_MEMBER_NAME_FALLBACK)
    expect(friendshipAdminDisplayName('hidden@example.com')).toBe(FRIENDSHIP_MEMBER_NAME_FALLBACK)
    expect(friendshipAdminDisplayName('11111111-1111-4111-8111-111111111111')).toBe(
      FRIENDSHIP_MEMBER_NAME_FALLBACK
    )
    expect(friendshipAdminDisplayName('Billingsley')).toBe('Billingsley')
    expect(
      adminFriendshipOperationsLeaksSensitiveData({
        recipientName: 'Billingsley',
        linked: { status: 'ready', linkedRecommendationNames: ['Priority'] },
      })
    ).toBe(false)
    expect(
      adminFriendshipOperationsLeaksSensitiveData({
        recipientName: 'hidden@example.com',
      })
    ).toBe(true)
    expect(adminFriendshipOperationsLeaksSensitiveData({ user_id: 'recipient-ada' })).toBe(true)
    expect(adminFriendshipOperationsLeaksSensitiveData({ email: 'ada@example.com' })).toBe(true)
    expect(adminFriendshipOperationsLeaksSensitiveData({ compatibility_score: 10 })).toBe(true)
  })

  it('resolves deleted and unsafe profile names without copying private fields', async () => {
    const client = detailClient({
      batches: [deliveredBatch],
      recommendations: {
        data: [
          {
            batch_id: 'batch-delivered',
            user_id: 'recipient-ada',
            recommended_user_id: 'missing-member',
            compatibility_score: 70,
            email: 'secret@example.com',
          },
          {
            batch_id: 'batch-delivered',
            user_id: 'recipient-ada',
            recommended_user_id: 'email-member',
          },
        ],
        error: null,
      },
      profiles: {
        data: [
          { id: 'recipient-ada', full_name: null, email: 'ada@example.com' },
          { id: 'email-member', full_name: 'hidden@example.com' },
        ],
        error: null,
      },
    })

    const result = await loadAdminFriendshipMatchOperations(client, { isAdmin: true })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.recentBatches[0]).toEqual({
      createdAt: '2026-10-05T15:00:00.000Z',
      status: 'delivered',
      recommendationsAtCreation: 2,
      recipientName: FRIENDSHIP_MEMBER_NAME_FALLBACK,
      linked: {
        status: 'ready',
        linkedRecommendationNames: [
          FRIENDSHIP_MEMBER_NAME_FALLBACK,
          FRIENDSHIP_MEMBER_NAME_FALLBACK,
        ],
      },
    })
    const serialized = JSON.stringify(result.data)
    expect(serialized).not.toContain('hidden@example.com')
    expect(serialized).not.toContain('ada@example.com')
    expect(serialized).not.toContain('secret@example.com')
    expect(serialized).not.toContain('missing-member')
    expect(serialized).not.toContain('recipient-ada')
    expect(serialized).not.toMatch(/compatibility_score|score_breakdown/)
  })
})

describe('admin Friendship refresh', () => {
  afterEach(() => {
    vi.clearAllMocks()
    isFriendshipMatchingEnabled.mockReturnValue(false)
  })

  it('does not write when the caller is not an admin', async () => {
    const result = await executeAdminFriendshipRefresh({
      isAdmin: false,
      supabase: createClient({}),
    })
    expect(result).toEqual({ ok: false, error: 'Administrator access required.' })
    expect(refreshFriendshipRecommendationsForAllEligible).not.toHaveBeenCalled()
    expect(runScheduledCuratedMatchDelivery).not.toHaveBeenCalled()
    expect(generateCuratedRecommendationsForAllEligible).not.toHaveBeenCalled()
    expect(notifyCuratedMatchesDelivered).not.toHaveBeenCalled()
  })

  it('does not write when Friendship matching is disabled', async () => {
    isFriendshipMatchingEnabled.mockReturnValue(false)
    const result = await executeAdminFriendshipRefresh({
      isAdmin: true,
      supabase: createClient({}),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe(FRIENDSHIP_REFRESH_DISABLED_COPY)
    expect(refreshFriendshipRecommendationsForAllEligible).not.toHaveBeenCalled()
    expect(notifyCuratedMatchesDelivered).not.toHaveBeenCalled()
  })

  it('returns empty aggregates when tables are missing', async () => {
    isFriendshipMatchingEnabled.mockReturnValue(true)
    loadFriendshipMatchPool.mockResolvedValue({ profiles: [], error: null })
    refreshFriendshipRecommendationsForAllEligible.mockRejectedValue({
      code: '42P01',
      message: 'relation does not exist',
    })
    const result = await executeAdminFriendshipRefresh({
      isAdmin: true,
      supabase: createClient({}),
    })
    expect(result).toEqual({
      ok: true,
      result: {
        considered: 0,
        processed: 0,
        delivered: 0,
        empty: 0,
        skipped: 0,
        recommendationsWritten: 0,
      },
    })
  })

  it('invokes only Friendship refresh and returns aggregate counts', async () => {
    isFriendshipMatchingEnabled.mockReturnValue(true)
    loadFriendshipMatchPool.mockResolvedValue({
      profiles: [{ id: 'a' }, { id: 'b' }],
      error: null,
    })
    refreshFriendshipRecommendationsForAllEligible.mockResolvedValue({
      processed: 2,
      delivered: 1,
      empty: 1,
      skipped: 0,
      created: 4,
    })

    const result = await executeAdminFriendshipRefresh({
      isAdmin: true,
      supabase: { from: vi.fn() } as unknown as SupabaseClient<Database>,
    })

    expect(refreshFriendshipRecommendationsForAllEligible).toHaveBeenCalledOnce()
    expect(runScheduledCuratedMatchDelivery).not.toHaveBeenCalled()
    expect(generateCuratedRecommendationsForAllEligible).not.toHaveBeenCalled()
    expect(generateCuratedRecommendationsForUser).not.toHaveBeenCalled()
    expect(notifyCuratedMatchesDelivered).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: true,
      result: {
        considered: 2,
        processed: 2,
        delivered: 1,
        empty: 1,
        skipped: 0,
        recommendationsWritten: 4,
      },
    })
    expect(adminFriendshipOperationsLeaksSensitiveData(result.ok ? result.result : {})).toBe(
      false
    )
  })

  it('does not write when confirmation is cancelled', () => {
    expect(confirmedFriendshipRefresh(false)).toBe(false)
    expect(confirmedFriendshipRefresh(true)).toBe(true)
    expect(refreshFriendshipRecommendationsForAllEligible).not.toHaveBeenCalled()
  })
})

describe('admin authorization and privacy copy', () => {
  it('treats only the admin role as authorized', () => {
    expect(isAdminViewer(null)).toBe(false)
    expect(isAdminViewer({ role: 'member' })).toBe(false)
    expect(isAdminViewer({ role: 'admin' })).toBe(true)
  })

  it('keeps UI copy free of scores, emails, and member identifiers', () => {
    const copy = [
      FRIENDSHIP_ADMIN_HEADING,
      FRIENDSHIP_BATCH_HISTORY_NOTE,
      FRIENDSHIP_EMPTY_BATCH_MESSAGE,
      FRIENDSHIP_UNLINKED_BATCH_MESSAGE,
      FRIENDSHIP_DETAILS_UNAVAILABLE_MESSAGE,
      FRIENDSHIP_MEMBER_NAME_FALLBACK,
      FRIENDSHIP_NO_EMAIL_COPY,
      FRIENDSHIP_REFRESH_BUTTON_LABEL,
      FRIENDSHIP_REFRESH_CONFIRMATION,
      FRIENDSHIP_REFRESH_DISABLED_COPY,
    ].join(' ')
    expect(copy).toContain('Friendship Match Recommendations')
    expect(copy).toContain(
      'Later refreshes can move recommendations to newer batches. This list shows recommendations currently linked to this batch, not a complete historical roster.'
    )
    expect(copy).toContain('does not send email')
    expect(copy).not.toMatch(/score|alcohol|billing|@|user id|uuid/i)
  })

  it('does not wire Dating generation or email helpers into the Friendship action', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/(club)/admin/curated-matches/actions.ts'),
      'utf8'
    )
    expect(source).toContain('executeAdminFriendshipRefresh')
    expect(source).toContain('runScheduledCuratedMatchDelivery')
    expect(source).toContain('generateCuratedRecommendationsForAllEligible')
    const friendshipAction = source.slice(source.indexOf('refreshFriendshipRecommendationsAction'))
    expect(friendshipAction).not.toContain('runScheduledCuratedMatchDelivery')
    expect(friendshipAction).not.toContain('generateCuratedRecommendationsForAllEligible')
    expect(friendshipAction).not.toContain('notifyCuratedMatchesDelivered')
    expect(source).not.toContain('moderation_actions')
  })

  it('rejects signed-out and non-admin viewers before the admin database client', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'app/(club)/admin/curated-matches/page.tsx'),
      'utf8'
    )
    const viewerLookup = page.indexOf('getViewer()')
    const loginRedirect = page.indexOf("redirect('/login')")
    const adminRedirect = page.indexOf("redirect('/home')")
    const adminClient = page.indexOf('requireAdminClient()')
    const load = page.indexOf('loadAdminFriendshipMatchOperations(supabase')
    expect(viewerLookup).toBeGreaterThan(-1)
    expect(loginRedirect).toBeGreaterThan(viewerLookup)
    expect(adminRedirect).toBeGreaterThan(loginRedirect)
    expect(adminClient).toBeGreaterThan(adminRedirect)
    expect(load).toBeGreaterThan(adminClient)
    expect(page).toContain('isAdmin: isAdminViewer(viewer)')
  })

  it('renders directional batch details without private fields', () => {
    const panel = readFileSync(
      resolve(process.cwd(), 'components/admin/admin-friendship-match-operations.tsx'),
      'utf8'
    )
    expect(panel).toContain('presentFriendshipBatchDetail')
    expect(panel).toContain('FRIENDSHIP_BATCH_HISTORY_NOTE')
    expect(panel).toContain('detail.creationCountLabel')
    expect(panel).toContain('detail.linkedLabel')
    expect(panel).toContain('detail.directionLabel')
    expect(panel).not.toMatch(/mutual|reciprocal|compatibility_score|score_breakdown|recommended_user_id/)
    expect(panel).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  })
})
