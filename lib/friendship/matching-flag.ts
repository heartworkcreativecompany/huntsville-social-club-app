import {
  FRIENDSHIP_MATCHING_UNAVAILABLE_BODY,
  FRIENDSHIP_MATCHING_UNAVAILABLE_HEADING,
  isFriendshipMatchingEnabled,
} from '@/lib/friendship/eligibility'

export type FriendshipMatchesView =
  | {
      kind: 'gated'
      loadRecommendations: false
    }
  | {
      kind: 'unavailable'
      title: string
      description: string
      loadRecommendations: false
    }
  | {
      kind: 'inbox'
      loadRecommendations: true
    }

export function resolveFriendshipMatchesView(input: {
  canViewMatches: boolean
  matchingEnabled?: boolean
}): FriendshipMatchesView {
  const matchingEnabled = input.matchingEnabled ?? isFriendshipMatchingEnabled()
  if (!matchingEnabled) {
    return {
      kind: 'unavailable',
      title: FRIENDSHIP_MATCHING_UNAVAILABLE_HEADING,
      description: FRIENDSHIP_MATCHING_UNAVAILABLE_BODY,
      loadRecommendations: false,
    }
  }

  if (!input.canViewMatches) {
    return {
      kind: 'gated',
      loadRecommendations: false,
    }
  }

  return { kind: 'inbox', loadRecommendations: true }
}

export function friendshipCronShouldRefresh(
  matchingEnabled = isFriendshipMatchingEnabled()
): { refresh: boolean; reason: string | null } {
  if (!matchingEnabled) {
    return {
      refresh: false,
      reason: 'Friendship matching is disabled.',
    }
  }
  return { refresh: true, reason: null }
}
