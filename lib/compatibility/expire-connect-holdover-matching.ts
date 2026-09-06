import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  cancelScheduledBatches,
  expirePendingRecommendations,
} from '@/lib/compatibility/lifecycle-db'
import { expirePendingFriendshipRecommendations } from '@/lib/friendship/friendship-lifecycle'
import {
  deactivateExpiredEntitlementCycle,
  loadExpiredActiveCircleCycles,
} from '@/lib/membership-billing-cycles'
import {
  buildMemberEntitlements,
  shouldExpireConnectHoldoverMatching,
  type EntitlementCycle,
} from '@/lib/membership-entitlements'
import type { ProductTier } from '@/lib/membership-tier-config'

type AdminClient = SupabaseClient<Database>

export const CONNECT_HOLDOVER_EXPIRY_CANCELLATION_REASON =
  'connect_holdover_expired'

export type ConnectHoldoverExpiryResult = {
  cleaned: boolean
  userId: string
}

export type ConnectHoldoverExpirySummary = {
  considered: number
  cleaned: number
  results: ConnectHoldoverExpiryResult[]
}

export function connectHoldoverExpiryCandidates(
  cycles: Array<{ userId: string; cycle: EntitlementCycle }>,
  profiles: Array<{
    id: string
    role: string | null
    membership_billing: unknown
    application_status: string | null
  }>,
  now: Date = new Date()
): Array<{ userId: string; cycle: EntitlementCycle; productTier: ProductTier }> {
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]))
  const candidates: Array<{
    userId: string
    cycle: EntitlementCycle
    productTier: ProductTier
  }> = []

  for (const row of cycles) {
    const profile = profileById.get(row.userId)
    if (!profile) continue

    const entitlements = buildMemberEntitlements({
      role: profile.role,
      billing: profile.membership_billing,
      applicationApproved: profile.application_status === 'approved',
      activeCycle: row.cycle,
      now,
    })

    if (
      shouldExpireConnectHoldoverMatching({
        productTier: entitlements.productTier,
        cycle: row.cycle,
        now,
      })
    ) {
      candidates.push({
        ...row,
        productTier: entitlements.productTier,
      })
    }
  }

  return candidates
}

export async function expireConnectHoldoverMatchingForUser(
  supabase: AdminClient,
  input: {
    userId: string
    cycle: EntitlementCycle
    productTier: ProductTier
    now?: Date
  }
): Promise<ConnectHoldoverExpiryResult> {
  const now = input.now ?? new Date()
  if (
    !shouldExpireConnectHoldoverMatching({
      productTier: input.productTier,
      cycle: input.cycle,
      now,
    })
  ) {
    return { cleaned: false, userId: input.userId }
  }

  await expirePendingRecommendations(supabase, input.userId)
  await expirePendingFriendshipRecommendations(supabase, input.userId)
  await cancelScheduledBatches(
    supabase,
    input.userId,
    CONNECT_HOLDOVER_EXPIRY_CANCELLATION_REASON
  )
  await deactivateExpiredEntitlementCycle(supabase, input.cycle.id, now)

  return { cleaned: true, userId: input.userId }
}

async function loadHoldoverExpiryProfiles(
  supabase: AdminClient,
  userIds: string[]
): Promise<
  Array<{
    id: string
    role: string | null
    membership_billing: unknown
    application_status: string | null
  }>
> {
  if (userIds.length === 0) return []

  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, membership_billing, application_status')
    .in('id', userIds)

  if (error) {
    if (error.code === '42P01') return []
    throw new Error(error.message)
  }

  return data ?? []
}

export async function expireDueConnectHoldoverMatching(
  supabase: AdminClient,
  now: Date = new Date()
): Promise<ConnectHoldoverExpirySummary> {
  const expiredCycles = await loadExpiredActiveCircleCycles(supabase, now)
  const profiles = await loadHoldoverExpiryProfiles(
    supabase,
    expiredCycles.map((row) => row.userId)
  )
  const candidates = connectHoldoverExpiryCandidates(
    expiredCycles,
    profiles,
    now
  )
  const results: ConnectHoldoverExpiryResult[] = []

  for (const candidate of candidates) {
    results.push(
      await expireConnectHoldoverMatchingForUser(supabase, {
        userId: candidate.userId,
        cycle: candidate.cycle,
        productTier: candidate.productTier,
        now,
      })
    )
  }

  return {
    considered: candidates.length,
    cleaned: results.filter((result) => result.cleaned).length,
    results,
  }
}
