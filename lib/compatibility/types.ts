export const DATING_CONNECTION_OPTION = 'Dating' as const

export type CuratedMatchPauseReason =
  | 'user_paused'
  | 'dating_removed'
  | 'subscription_inactive'
  | 'not_approved'

export type CuratedMatchBatchStatus =
  | 'scheduled'
  | 'processing'
  | 'delivered'
  | 'empty'
  | 'cancelled'

export type CuratedMatchRecommendationStatus =
  | 'pending'
  | 'viewed'
  | 'accepted'
  | 'passed'
  | 'expired'

/** Private questionnaire payload — populated in Phase 2. */
export type CompatibilityQuestionnaire = {
  version: 1
  [key: string]: unknown
}

export type CompatibilityProfileFields = {
  application_status: string | null
  connections_open_to: string[] | null
  compatibility_completed_at: string | null
  wants_curated_matches: boolean | null
  curated_matches_paused_at: string | null
  curated_matches_pause_reason: CuratedMatchPauseReason | null
  dating_connection_enabled_at: string | null
  dating_connection_removed_at: string | null
  messaging_entitlement_lost_at: string | null
  messaging_entitlement_restored_at: string | null
  role?: string | null
  membership_billing?: unknown
}

export type DatingConnectionChange =
  | { type: 'none' }
  | { type: 'added' }
  | { type: 'removed' }
