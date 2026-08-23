import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { loadFriendshipMatchPool } from '@/lib/friendship/candidate-pool'
import { isFriendshipMatchingEnabled } from '@/lib/friendship/eligibility'
import { refreshFriendshipRecommendationsForAllEligible } from '@/lib/friendship/generate-recommendations'

export const FRIENDSHIP_ADMIN_HEADING = 'Friendship Match Recommendations'

export const FRIENDSHIP_REFRESH_BUTTON_LABEL = 'Refresh Friendship Recommendations'

export const FRIENDSHIP_REFRESH_CONFIRMATION =
  'Refresh Friendship recommendations for all eligible members? This updates in-app recommendations and does not send email.'

export const FRIENDSHIP_REFRESH_DISABLED_COPY =
  'Friendship matching is disabled. Set FRIENDSHIP_MATCHING_ENABLED=true and redeploy to enable recommendation refreshes.'

export const FRIENDSHIP_NO_EMAIL_COPY =
  'Friendship recommendations refresh in-app and do not send email.'

export type MatchOperationsProduct = 'dating' | 'friendship'
export type DatingDeliveryTab = 'delivery' | 'history'

export type AdminFriendshipBatchRow = {
  created_at: string
  status: string
  match_count: number
}

export type AdminFriendshipMatchOperations = {
  matchingEnabled: boolean
  submittedQuestionnaireCount: number
  eligiblePoolCount: number
  latestBatch: {
    createdAt: string
    status: string
    recommendationCount: number
  } | null
  last30Days: {
    batchCount: number
    deliveredCount: number
    emptyCount: number
    recommendationsWritten: number
  }
  recentBatches: AdminFriendshipBatchRow[]
}

export type AdminFriendshipRefreshResult = {
  considered: number
  processed: number
  delivered: number
  empty: number
  skipped: number
  recommendationsWritten: number
}

const EMPTY_OPERATIONS: AdminFriendshipMatchOperations = {
  matchingEnabled: false,
  submittedQuestionnaireCount: 0,
  eligiblePoolCount: 0,
  latestBatch: null,
  last30Days: {
    batchCount: 0,
    deliveredCount: 0,
    emptyCount: 0,
    recommendationsWritten: 0,
  },
  recentBatches: [],
}

const FORBIDDEN_ADMIN_KEYS = [
  'compatibility_score',
  'compatibilityscore',
  'score',
  'score_breakdown',
  'scorebreakdown',
  'answers',
  'priorities',
  'friendshippriorities',
  'alcoholfrequency',
  'alcoholcomfort',
  'alcohol',
  'billing',
  'membership_billing',
  'user_id',
  'userid',
  'recommended_user_id',
  'recommendeduserid',
  'email',
  'full_name',
  'displayname',
  'skipreason',
  'skip_reason',
  'skipreasons',
]

export function resolveMatchOperationsProduct(
  value?: string | string[] | null
): MatchOperationsProduct {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === 'friendship' ? 'friendship' : 'dating'
}

export function resolveDatingDeliveryTab(
  value?: string | string[] | null
): DatingDeliveryTab {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === 'history' ? 'history' : 'delivery'
}

export function isAdminViewer(viewer: { role?: string | null } | null | undefined): boolean {
  return viewer?.role === 'admin'
}

export function confirmedFriendshipRefresh(confirmed: boolean): boolean {
  return confirmed === true
}

export function isMissingRelationError(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false
  if (error.code === '42P01') return true
  return /does not exist|Friendship tables are missing/i.test(error.message ?? '')
}

function collectKeys(value: unknown, keys: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys)
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, nested] of Object.entries(value)) {
    keys.add(key)
    collectKeys(nested, keys)
  }
}

export function adminFriendshipOperationsLeaksSensitiveData(payload: unknown): boolean {
  const keys = new Set<string>()
  collectKeys(payload, keys)
  for (const key of keys) {
    if (FORBIDDEN_ADMIN_KEYS.includes(key.toLowerCase())) {
      return true
    }
  }

  const serialized = JSON.stringify(payload)
  return /compatibility_score|score_breakdown|alcohol|priority|billing|user_id|recommended_user_id|skipReason|@[^\s"]+\.[^\s"]+/i.test(
    serialized
  )
}

export function emptyAdminFriendshipMatchOperations(
  matchingEnabled = isFriendshipMatchingEnabled()
): AdminFriendshipMatchOperations {
  return {
    ...EMPTY_OPERATIONS,
    matchingEnabled,
  }
}

export async function loadAdminFriendshipMatchOperations(
  supabase: SupabaseClient<Database>,
  input: { isAdmin: boolean }
): Promise<
  | { ok: true; data: AdminFriendshipMatchOperations }
  | { ok: false; error: string }
> {
  if (!input.isAdmin) {
    return { ok: false, error: 'Administrator access required.' }
  }

  const matchingEnabled = isFriendshipMatchingEnabled()
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - 30)
  const sinceIso = since.toISOString()

  const submittedResult = await supabase
    .from('friendship_questionnaires')
    .select('status', { count: 'exact', head: true })
    .eq('status', 'submitted')
    .not('completed_at', 'is', null)

  if (submittedResult.error && !isMissingRelationError(submittedResult.error)) {
    return { ok: false, error: 'Unable to load Friendship questionnaire totals.' }
  }

  const recentResult = await supabase
    .from('friendship_match_batches')
    .select('created_at, status, match_count')
    .order('created_at', { ascending: false })
    .limit(25)

  if (recentResult.error && !isMissingRelationError(recentResult.error)) {
    return { ok: false, error: 'Unable to load Friendship batch history.' }
  }

  const last30Result = await supabase
    .from('friendship_match_batches')
    .select('status, match_count')
    .gte('created_at', sinceIso)

  if (last30Result.error && !isMissingRelationError(last30Result.error)) {
    return { ok: false, error: 'Unable to load Friendship batch totals.' }
  }

  const pool = await loadFriendshipMatchPool(supabase)
  if (pool.error && !isMissingRelationError({ message: pool.error })) {
    return { ok: false, error: 'Unable to load the Friendship match pool.' }
  }

  const recentBatches = (recentResult.data ?? []).map((row) => ({
    created_at: row.created_at,
    status: row.status,
    match_count: row.match_count,
  }))
  const latest = recentBatches[0] ?? null
  const last30Rows = last30Result.data ?? []

  const data: AdminFriendshipMatchOperations = {
    matchingEnabled,
    submittedQuestionnaireCount: submittedResult.count ?? 0,
    eligiblePoolCount: pool.profiles.length,
    latestBatch: latest
      ? {
          createdAt: latest.created_at,
          status: latest.status,
          recommendationCount: latest.match_count,
        }
      : null,
    last30Days: {
      batchCount: last30Rows.length,
      deliveredCount: last30Rows.filter((row) => row.status === 'delivered').length,
      emptyCount: last30Rows.filter((row) => row.status === 'empty').length,
      recommendationsWritten: last30Rows.reduce(
        (total, row) => total + Number(row.match_count ?? 0),
        0
      ),
    },
    recentBatches,
  }

  if (adminFriendshipOperationsLeaksSensitiveData(data)) {
    return { ok: false, error: 'Unable to load Friendship match operations.' }
  }

  return { ok: true, data }
}

export async function executeAdminFriendshipRefresh(input: {
  isAdmin: boolean
  supabase: SupabaseClient<Database>
}): Promise<
  | { ok: true; result: AdminFriendshipRefreshResult }
  | { ok: false; error: string }
> {
  if (!input.isAdmin) {
    return { ok: false, error: 'Administrator access required.' }
  }

  if (!isFriendshipMatchingEnabled()) {
    return { ok: false, error: FRIENDSHIP_REFRESH_DISABLED_COPY }
  }

  try {
    const pool = await loadFriendshipMatchPool(input.supabase)
    if (pool.error && !isMissingRelationError({ message: pool.error })) {
      return { ok: false, error: 'Friendship recommendation refresh failed.' }
    }

    const summary = await refreshFriendshipRecommendationsForAllEligible(input.supabase)
    const result: AdminFriendshipRefreshResult = {
      considered: pool.profiles.length,
      processed: summary.processed,
      delivered: summary.delivered,
      empty: summary.empty,
      skipped: summary.skipped,
      recommendationsWritten: summary.created,
    }

    if (adminFriendshipOperationsLeaksSensitiveData(result)) {
      return { ok: false, error: 'Friendship recommendation refresh failed.' }
    }

    return { ok: true, result }
  } catch (error) {
    if (isMissingRelationError(error as { code?: string; message?: string })) {
      return {
        ok: true,
        result: {
          considered: 0,
          processed: 0,
          delivered: 0,
          empty: 0,
          skipped: 0,
          recommendationsWritten: 0,
        },
      }
    }
    return { ok: false, error: 'Friendship recommendation refresh failed.' }
  }
}
