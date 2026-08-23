import type { FriendshipFitLabel } from '@/lib/friendship/types'
import { MIN_FRIENDSHIP_RECOMMENDATION_SCORE } from '@/lib/friendship/scoring'

export const FRIENDSHIP_FIT_LABELS: readonly FriendshipFitLabel[] = [
  'Strong friendship fit',
  'Promising connection',
  'Shared interests to explore',
] as const

export const STRONG_FRIENDSHIP_FIT_MIN = 80
export const PROMISING_CONNECTION_MIN = 65

export function friendshipFitLabel(score: number): FriendshipFitLabel | null {
  if (score >= STRONG_FRIENDSHIP_FIT_MIN) {
    return 'Strong friendship fit'
  }
  if (score >= PROMISING_CONNECTION_MIN) {
    return 'Promising connection'
  }
  if (score >= MIN_FRIENDSHIP_RECOMMENDATION_SCORE) {
    return 'Shared interests to explore'
  }
  return null
}

export function isRecommendableFriendshipScore(score: number): boolean {
  return friendshipFitLabel(score) != null
}
