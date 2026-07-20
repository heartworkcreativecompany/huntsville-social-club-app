export const RECOMMENDATION_TTL_DAYS = 30
export const RE_RECOMMEND_COOLDOWN_DAYS = 90

export const ACTIVE_RECOMMENDATION_STATUSES = [
  'pending',
  'viewed',
  'accepted',
] as const

export type ActiveRecommendationStatus =
  (typeof ACTIVE_RECOMMENDATION_STATUSES)[number]

export function recommendationExpiresAt(from = new Date()): string {
  const expires = new Date(from)
  expires.setDate(expires.getDate() + RECOMMENDATION_TTL_DAYS)
  return expires.toISOString()
}

export function isActiveRecommendationStatus(status: string): boolean {
  return ACTIVE_RECOMMENDATION_STATUSES.includes(
    status as ActiveRecommendationStatus
  )
}

export const ARCHIVED_RECOMMENDATION_STATUSES = [
  'passed',
  'declined',
  'expired',
] as const

export type ArchivedRecommendationStatus =
  (typeof ARCHIVED_RECOMMENDATION_STATUSES)[number]

export function isArchivedRecommendationStatus(status: string): boolean {
  return ARCHIVED_RECOMMENDATION_STATUSES.includes(
    status as ArchivedRecommendationStatus
  )
}
