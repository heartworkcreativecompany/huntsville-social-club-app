import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { loadFriendshipMatchPool } from '@/lib/friendship/candidate-pool'
import { isFriendshipMatchingEnabled } from '@/lib/friendship/eligibility'
import { refreshFriendshipRecommendationsForAllEligible } from '@/lib/friendship/generate-recommendations'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'

export const FRIENDSHIP_ADMIN_HEADING = 'Friendship Match Recommendations'

export const FRIENDSHIP_REFRESH_BUTTON_LABEL = 'Refresh Friendship Recommendations'

export const FRIENDSHIP_REFRESH_CONFIRMATION =
  'Refresh Friendship recommendations for all eligible members? This updates in-app recommendations and does not send email.'

export const FRIENDSHIP_REFRESH_DISABLED_COPY =
  'Friendship matching is disabled. Set FRIENDSHIP_MATCHING_ENABLED=true and redeploy to enable recommendation refreshes.'

export const FRIENDSHIP_NO_EMAIL_COPY =
  'Friendship recommendations refresh in-app and do not send email.'

export const FRIENDSHIP_BATCH_HISTORY_NOTE =
  'Later refreshes can move recommendations to newer batches. This list shows recommendations currently linked to this batch, not a complete historical roster.'

export const FRIENDSHIP_MEMBER_NAME_FALLBACK = 'Member name unavailable'

export const FRIENDSHIP_EMPTY_BATCH_MESSAGE =
  'No recommendations were generated for this batch.'

export const FRIENDSHIP_UNLINKED_BATCH_MESSAGE =
  'Recommendations were written for this batch, but none are currently linked to it.'

export const FRIENDSHIP_DETAILS_UNAVAILABLE_MESSAGE =
  'Recommendation details are unavailable.'

export const FRIENDSHIP_CREATION_COUNT_LABEL = 'Recommendations at creation'

export const FRIENDSHIP_LINKED_LABEL = 'Currently linked recommendations'

const RECENT_FRIENDSHIP_BATCH_LIMIT = 25
const FRIENDSHIP_ADMIN_ID_CHUNK = 100

const NAME_FIELD_RESTRICTED =
  /user_id|recommended_user_id|compatibility_score|score_breakdown|@[^\s"]+\.[^\s"]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const NON_NAME_RESTRICTED =
  /compatibility_score|score_breakdown|alcohol|priority|billing|user_id|recommended_user_id|skipReason|@[^\s"]+\.[^\s"]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

const ADMIN_DISPLAY_NAME_KEYS = new Set([
  'recipientname',
  'linkedrecommendationnames',
])

export type MatchOperationsProduct = 'dating' | 'friendship'
export type DatingDeliveryTab = 'delivery' | 'history'

export type AdminFriendshipLinkedDetail =
  | { status: 'ready'; linkedRecommendationNames: string[] }
  | { status: 'unavailable' }

export type AdminFriendshipBatchRow = {
  createdAt: string
  status: string
  recommendationsAtCreation: number
  recipientName: string | null
  linked: AdminFriendshipLinkedDetail
}

export type FriendshipBatchDetailPresentation = {
  directionLabel: string | null
  creationCountLabel: string
  linkedLabel: string
  message: string | null
  linkedNames: string[]
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

function valueLeaksSensitiveData(value: unknown, parentKey?: string): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => valueLeaksSensitiveData(item, parentKey))
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([key, nested]) => {
      if (FORBIDDEN_ADMIN_KEYS.includes(key.toLowerCase())) return true
      return valueLeaksSensitiveData(nested, key)
    })
  }
  if (typeof value !== 'string') return false
  if (parentKey && ADMIN_DISPLAY_NAME_KEYS.has(parentKey.toLowerCase())) {
    return NAME_FIELD_RESTRICTED.test(value)
  }
  return NON_NAME_RESTRICTED.test(value)
}

export function adminFriendshipOperationsLeaksSensitiveData(payload: unknown): boolean {
  const keys = new Set<string>()
  collectKeys(payload, keys)
  for (const key of keys) {
    if (FORBIDDEN_ADMIN_KEYS.includes(key.toLowerCase())) {
      return true
    }
  }
  return valueLeaksSensitiveData(payload)
}

export function friendshipAdminDisplayName(fullName: string | null | undefined): string {
  const trimmed = fullName?.trim() ?? ''
  if (!trimmed || NAME_FIELD_RESTRICTED.test(trimmed)) {
    return FRIENDSHIP_MEMBER_NAME_FALLBACK
  }
  return trimmed
}

export function presentFriendshipBatchDetail(
  batch: AdminFriendshipBatchRow
): FriendshipBatchDetailPresentation {
  const creationCountLabel = `${FRIENDSHIP_CREATION_COUNT_LABEL}: ${batch.recommendationsAtCreation}`
  const directionLabel = batch.recipientName
    ? `Recommended to ${batch.recipientName}`
    : null
  const linkedLabel = FRIENDSHIP_LINKED_LABEL

  if (batch.recipientName == null || batch.linked.status === 'unavailable') {
    return {
      directionLabel,
      creationCountLabel,
      linkedLabel,
      message: FRIENDSHIP_DETAILS_UNAVAILABLE_MESSAGE,
      linkedNames: [],
    }
  }

  if (batch.linked.linkedRecommendationNames.length > 0) {
    return {
      directionLabel,
      creationCountLabel,
      linkedLabel,
      message: null,
      linkedNames: batch.linked.linkedRecommendationNames,
    }
  }

  if (batch.recommendationsAtCreation === 0) {
    return {
      directionLabel,
      creationCountLabel,
      linkedLabel,
      message: FRIENDSHIP_EMPTY_BATCH_MESSAGE,
      linkedNames: [],
    }
  }

  return {
    directionLabel,
    creationCountLabel,
    linkedLabel,
    message: FRIENDSHIP_UNLINKED_BATCH_MESSAGE,
    linkedNames: [],
  }
}

export function emptyAdminFriendshipMatchOperations(
  matchingEnabled = isFriendshipMatchingEnabled()
): AdminFriendshipMatchOperations {
  return {
    ...EMPTY_OPERATIONS,
    matchingEnabled,
  }
}

type FriendshipBatchSource = {
  id: string
  user_id: string
  created_at: string
  status: string
  match_count: number
}

type FriendshipRecommendationLink = {
  batch_id: string
  user_id: string
  recommended_user_id: string
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => id.length > 0))]
}

function chunkIds(ids: string[]): string[][] {
  const unique = uniqueIds(ids)
  const chunks: string[][] = []
  for (let index = 0; index < unique.length; index += FRIENDSHIP_ADMIN_ID_CHUNK) {
    chunks.push(unique.slice(index, index + FRIENDSHIP_ADMIN_ID_CHUNK))
  }
  return chunks
}

async function loadRecommendationLinks(
  supabase: SupabaseClient<Database>,
  batchIds: string[]
): Promise<{ ok: true; rows: FriendshipRecommendationLink[] } | { ok: false }> {
  const rows: FriendshipRecommendationLink[] = []
  for (const ids of chunkIds(batchIds)) {
    const result = await supabase
      .from('friendship_match_recommendations')
      .select('batch_id, user_id, recommended_user_id')
      .in('batch_id', ids)

    if (result.error) return { ok: false }
    for (const row of result.data ?? []) {
      rows.push({
        batch_id: row.batch_id,
        user_id: row.user_id,
        recommended_user_id: row.recommended_user_id,
      })
    }
  }
  return { ok: true, rows }
}

async function loadMemberDisplayNames(
  supabase: SupabaseClient<Database>,
  memberIds: string[]
): Promise<{ ok: true; names: Map<string, string> } | { ok: false }> {
  const names = new Map<string, string>()
  for (const ids of chunkIds(memberIds)) {
    const result = await supabase
      .from(MEMBER_PROFILES_VIEW)
      .select('id, full_name')
      .in('id', ids)

    if (result.error) return { ok: false }
    for (const row of result.data ?? []) {
      names.set(row.id, friendshipAdminDisplayName(row.full_name))
    }
  }
  return { ok: true, names }
}

function linkedNamesForBatch(
  batch: FriendshipBatchSource,
  rows: FriendshipRecommendationLink[],
  names: Map<string, string>
): string[] {
  const seen = new Set<string>()
  const linked: string[] = []
  for (const row of rows) {
    if (row.batch_id !== batch.id) continue
    if (row.user_id !== batch.user_id) continue
    if (!row.recommended_user_id || row.recommended_user_id === batch.user_id) continue
    if (seen.has(row.recommended_user_id)) continue
    seen.add(row.recommended_user_id)
    linked.push(names.get(row.recommended_user_id) ?? FRIENDSHIP_MEMBER_NAME_FALLBACK)
  }
  return linked
}

function toAdminBatchRow(
  batch: FriendshipBatchSource,
  links: { ok: true; rows: FriendshipRecommendationLink[] } | { ok: false },
  names: { ok: true; names: Map<string, string> } | { ok: false }
): AdminFriendshipBatchRow {
  const recipientName = names.ok
    ? (names.names.get(batch.user_id) ?? FRIENDSHIP_MEMBER_NAME_FALLBACK)
    : null

  if (!links.ok || !names.ok) {
    return {
      createdAt: batch.created_at,
      status: batch.status,
      recommendationsAtCreation: batch.match_count,
      recipientName,
      linked: { status: 'unavailable' },
    }
  }

  return {
    createdAt: batch.created_at,
    status: batch.status,
    recommendationsAtCreation: batch.match_count,
    recipientName,
    linked: {
      status: 'ready',
      linkedRecommendationNames: linkedNamesForBatch(batch, links.rows, names.names),
    },
  }
}

async function loadRecentFriendshipBatches(
  supabase: SupabaseClient<Database>,
  batches: FriendshipBatchSource[]
): Promise<AdminFriendshipBatchRow[]> {
  if (batches.length === 0) return []

  const links = await loadRecommendationLinks(
    supabase,
    batches.map((batch) => batch.id)
  )
  const recipientByBatch = new Map(batches.map((batch) => [batch.id, batch.user_id]))
  const memberIds = batches.map((batch) => batch.user_id)
  if (links.ok) {
    for (const row of links.rows) {
      if (recipientByBatch.get(row.batch_id) !== row.user_id) continue
      if (!row.recommended_user_id || row.recommended_user_id === row.user_id) continue
      memberIds.push(row.recommended_user_id)
    }
  }

  const names = await loadMemberDisplayNames(supabase, memberIds)
  return batches.map((batch) => toAdminBatchRow(batch, links, names))
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
    .select('id, user_id, created_at, status, match_count')
    .order('created_at', { ascending: false })
    .limit(RECENT_FRIENDSHIP_BATCH_LIMIT)

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

  const recentSource = recentResult.data ?? []
  const recentBatches = await loadRecentFriendshipBatches(supabase, recentSource)
  const latest = recentSource[0] ?? null
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
