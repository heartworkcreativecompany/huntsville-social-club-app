import { DIRECTORY_FULL_FIELDS, PROFILE_COMPATIBILITY_FIELDS } from '@/lib/profile-query-fields'

export const FRIENDSHIP_PRIVATE_TABLES = [
  'friendship_questionnaires',
  'friendship_match_batches',
  'friendship_match_recommendations',
] as const

export const FRIENDSHIP_ANSWER_FIELDS = [
  'friendshipGoals',
  'alcoholFrequency',
  'alcoholComfort',
  'friendshipPriorities',
] as const

export function directorySelectExcludesFriendshipAnswers(): boolean {
  const haystack = `${DIRECTORY_FULL_FIELDS} ${PROFILE_COMPATIBILITY_FIELDS}`.toLowerCase()
  return (
    !haystack.includes('friendship_questionnaire') &&
    !haystack.includes('friendship_questionnaires') &&
    !haystack.includes('alcohol_frequency') &&
    !haystack.includes('friendship_priorities')
  )
}

export type PublicFriendshipMatch = {
  id: string
  recommendedUserId: string
  displayName: string
  locationArea: string | null
  primaryPhoto: unknown
  fitLabel: string
  matchReasons: string[]
  createdAt: string
}

export function toPublicFriendshipMatch(input: {
  id: string
  recommendedUserId: string
  displayName: string
  locationArea: string | null
  primaryPhoto: unknown
  fitLabel: string
  matchReasons: string[]
  createdAt: string
  compatibilityScore?: number
  scoreBreakdown?: unknown
  answers?: unknown
  priorities?: unknown
}): PublicFriendshipMatch {
  return {
    id: input.id,
    recommendedUserId: input.recommendedUserId,
    displayName: input.displayName,
    locationArea: input.locationArea,
    primaryPhoto: input.primaryPhoto,
    fitLabel: input.fitLabel,
    matchReasons: input.matchReasons,
    createdAt: input.createdAt,
  }
}

export function publicMatchLeaksSensitiveData(match: object): boolean {
  const keys = Object.keys(match)
  const forbidden = [
    'compatibilityScore',
    'score',
    'scoreBreakdown',
    'answers',
    'friendshipPriorities',
    'priorities',
    'alcoholFrequency',
    'alcoholComfort',
    'membership_billing',
  ]
  return forbidden.some((key) => keys.includes(key))
}
