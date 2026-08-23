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
  FRIENDSHIP_NO_EMAIL_COPY,
  FRIENDSHIP_REFRESH_BUTTON_LABEL,
  FRIENDSHIP_REFRESH_CONFIRMATION,
  FRIENDSHIP_REFRESH_DISABLED_COPY,
  adminFriendshipOperationsLeaksSensitiveData,
  confirmedFriendshipRefresh,
  executeAdminFriendshipRefresh,
  isAdminViewer,
  loadAdminFriendshipMatchOperations,
  resolveDatingDeliveryTab,
  resolveMatchOperationsProduct,
} from '@/lib/friendship/load-admin-match-operations'

type QueryResult = {
  data?: unknown
  error?: { code?: string; message?: string } | null
  count?: number | null
}

function createQuery(result: QueryResult) {
  const query: Record<string, unknown> = {}
  const chain = () => query
  query.select = chain
  query.eq = chain
  query.not = chain
  query.gte = chain
  query.order = chain
  query.limit = chain
  query.then = (resolve: (value: QueryResult) => unknown) =>
    Promise.resolve(result).then(resolve)
  return query
}

function createClient(results: Record<string, QueryResult[]>): SupabaseClient<Database> {
  const unused = { ...results }
  return {
    from(table: string) {
      const queue = unused[table] ?? []
      const next = queue.shift() ?? { data: [], error: null, count: 0 }
      return createQuery(next)
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

  it('rejects non-admins without querying', async () => {
    const from = vi.fn()
    const result = await loadAdminFriendshipMatchOperations(
      { from } as unknown as SupabaseClient<Database>,
      { isAdmin: false }
    )
    expect(result).toEqual({ ok: false, error: 'Administrator access required.' })
    expect(from).not.toHaveBeenCalled()
    expect(loadFriendshipMatchPool).not.toHaveBeenCalled()
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
    const client = createClient({
      friendship_questionnaires: [{ data: null, error: null, count: 5 }],
      friendship_match_batches: [
        {
          data: [
            { created_at: '2026-08-20T12:00:00.000Z', status: 'delivered', match_count: 4 },
            { created_at: '2026-08-19T12:00:00.000Z', status: 'empty', match_count: 0 },
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
    })

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
      { created_at: '2026-08-20T12:00:00.000Z', status: 'delivered', match_count: 4 },
      { created_at: '2026-08-19T12:00:00.000Z', status: 'empty', match_count: 0 },
    ])
    expect(adminFriendshipOperationsLeaksSensitiveData(result.data)).toBe(false)
    const serialized = JSON.stringify(result.data)
    expect(serialized).not.toMatch(
      /compatibility_score|score_breakdown|alcohol|priority|billing|user_id|recommended_user_id|skipReason|@/i
    )
    expect(serialized).not.toContain('member-1')
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
      FRIENDSHIP_NO_EMAIL_COPY,
      FRIENDSHIP_REFRESH_BUTTON_LABEL,
      FRIENDSHIP_REFRESH_CONFIRMATION,
      FRIENDSHIP_REFRESH_DISABLED_COPY,
    ].join(' ')
    expect(copy).toContain('Friendship Match Recommendations')
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
})
