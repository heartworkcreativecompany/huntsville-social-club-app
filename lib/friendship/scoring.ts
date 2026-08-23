import { FRIENDSHIP_TIME_VALUES } from '@/lib/friendship/questionnaire-config'
import {
  expandFriendshipGoalsForScoring,
  isFriendshipQuestionnaireComplete,
  parseFriendshipQuestionnaire,
} from '@/lib/friendship/questionnaire'
import { deriveFriendshipMatchReasons } from '@/lib/friendship/match-explanation'
import type {
  FriendshipDimensionId,
  FriendshipQuestionnaireComplete,
} from '@/lib/friendship/types'

export const FRIENDSHIP_SCORE_ALGORITHM_VERSION = 'friendship_v1' as const
export const FRIENDSHIP_PRIORITY_BOOST = 1.25
export const MIN_FRIENDSHIP_RECOMMENDATION_SCORE = 50

export const FRIENDSHIP_BASE_DIMENSION_WEIGHTS: Record<FriendshipDimensionId, number> =
  {
    goals: 0.25,
    social: 0.2,
    lifestyle: 0.2,
    communication: 0.2,
    values: 0.15,
  }

const PRIORITY_TO_DIMENSION: Record<string, FriendshipDimensionId> = {
  shared_interests: 'social',
  similar_lifestyle: 'lifestyle',
  emotional_support: 'communication',
  communication_reliability: 'communication',
  humor_personality: 'values',
  faith_family_values: 'values',
  professional_networking: 'goals',
  new_local_experiences: 'social',
}

type ScoredItem = {
  id: string
  dimension: FriendshipDimensionId
  similarity: number | null
}

export type FriendshipScoreResult = {
  score: number
  breakdown: Record<string, number | string | string[] | Record<string, number>>
  reasons: string[]
}

function ordinalSimilarity(left: number, right: number): number {
  return 1 - Math.abs(left - right) / 4
}

export function jaccardSimilarity(left: string[], right: string[]): number | null {
  const a = new Set(left)
  const b = new Set(right)
  if (a.size === 0 || b.size === 0) {
    return null
  }

  let intersection = 0
  for (const item of a) {
    if (b.has(item)) {
      intersection += 1
    }
  }

  const union = new Set([...a, ...b]).size
  if (union === 0) {
    return null
  }

  return intersection / union
}

export function nearMatchSimilarity(
  left: number,
  right: number
): number {
  const distance = Math.abs(left - right)
  if (distance === 0) return 1
  if (distance === 1) return 0.7
  if (distance === 2) return 0.35
  return 0
}

const TIME_RANK: Record<string, number> = {
  few_times_month: 0,
  once_week: 1,
  multiple_week: 2,
}

export function timeTogetherSimilarity(
  left: string,
  right: string
): number | null {
  if (!left || !right) {
    return null
  }
  if (!FRIENDSHIP_TIME_VALUES.includes(left) || !FRIENDSHIP_TIME_VALUES.includes(right)) {
    return null
  }
  if (left === right) {
    return 1
  }
  if (left === 'flexible' || right === 'flexible') {
    return 0.75
  }

  const leftRank = TIME_RANK[left]
  const rightRank = TIME_RANK[right]
  if (leftRank == null || rightRank == null) {
    return null
  }

  return nearMatchSimilarity(leftRank, rightRank)
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function boostedDimensionWeights(
  priorities: string[]
): Record<FriendshipDimensionId, number> {
  const boosted = { ...FRIENDSHIP_BASE_DIMENSION_WEIGHTS }
  const dimensions = new Set<FriendshipDimensionId>()

  for (const priority of priorities.slice(0, 3)) {
    const dimension = PRIORITY_TO_DIMENSION[priority]
    if (dimension) {
      dimensions.add(dimension)
    }
  }

  for (const dimension of dimensions) {
    boosted[dimension] *= FRIENDSHIP_PRIORITY_BOOST
  }

  const total = Object.values(boosted).reduce((sum, value) => sum + value, 0)
  if (total <= 0) {
    return { ...FRIENDSHIP_BASE_DIMENSION_WEIGHTS }
  }

  const normalized = { ...boosted }
  for (const key of Object.keys(normalized) as FriendshipDimensionId[]) {
    normalized[key] = boosted[key] / total
  }
  return normalized
}

function collectItems(
  viewer: FriendshipQuestionnaireComplete,
  candidate: FriendshipQuestionnaireComplete
): ScoredItem[] {
  const items: ScoredItem[] = [
    {
      id: 'friendshipGoals',
      dimension: 'goals',
      similarity: jaccardSimilarity(
        expandFriendshipGoalsForScoring(viewer.friendshipGoals),
        expandFriendshipGoalsForScoring(candidate.friendshipGoals)
      ),
    },
    {
      id: 'desiredTimeTogether',
      dimension: 'goals',
      similarity: timeTogetherSimilarity(
        viewer.desiredTimeTogether,
        candidate.desiredTimeTogether
      ),
    },
    {
      id: 'longTermMeaningful',
      dimension: 'goals',
      similarity: ordinalSimilarity(viewer.longTermMeaningful, candidate.longTermMeaningful),
    },
    {
      id: 'wideCircleAndDeep',
      dimension: 'goals',
      similarity: ordinalSimilarity(viewer.wideCircleAndDeep, candidate.wideCircleAndDeep),
    },
    {
      id: 'rechargeWithPeople',
      dimension: 'social',
      similarity: ordinalSimilarity(viewer.rechargeWithPeople, candidate.rechargeWithPeople),
    },
    {
      id: 'preferOneOnOne',
      dimension: 'social',
      similarity: ordinalSimilarity(viewer.preferOneOnOne, candidate.preferOneOnOne),
    },
    {
      id: 'enjoyRegularFriendGroup',
      dimension: 'social',
      similarity: ordinalSimilarity(
        viewer.enjoyRegularFriendGroup,
        candidate.enjoyRegularFriendGroup
      ),
    },
    {
      id: 'likeMeetingNewPeople',
      dimension: 'social',
      similarity: ordinalSimilarity(
        viewer.likeMeetingNewPeople,
        candidate.likeMeetingNewPeople
      ),
    },
    {
      id: 'preferSpontaneousPlans',
      dimension: 'social',
      similarity: ordinalSimilarity(
        viewer.preferSpontaneousPlans,
        candidate.preferSpontaneousPlans
      ),
    },
    {
      id: 'comfortableInitiating',
      dimension: 'social',
      similarity: ordinalSimilarity(
        viewer.comfortableInitiating,
        candidate.comfortableInitiating
      ),
    },
    {
      id: 'idealHangouts',
      dimension: 'social',
      similarity: jaccardSimilarity(viewer.idealHangouts, candidate.idealHangouts),
    },
    {
      id: 'stayActiveOutside',
      dimension: 'lifestyle',
      similarity: ordinalSimilarity(viewer.stayActiveOutside, candidate.stayActiveOutside),
    },
    {
      id: 'enjoyLowKeyHangouts',
      dimension: 'lifestyle',
      similarity: ordinalSimilarity(
        viewer.enjoyLowKeyHangouts,
        candidate.enjoyLowKeyHangouts
      ),
    },
    {
      id: 'likeNightlife',
      dimension: 'lifestyle',
      similarity: ordinalSimilarity(viewer.likeNightlife, candidate.likeNightlife),
    },
    {
      id: 'preferStructuredSchedule',
      dimension: 'lifestyle',
      similarity: ordinalSimilarity(
        viewer.preferStructuredSchedule,
        candidate.preferStructuredSchedule
      ),
    },
    {
      id: 'openToLastMinutePlans',
      dimension: 'lifestyle',
      similarity: ordinalSimilarity(
        viewer.openToLastMinutePlans,
        candidate.openToLastMinutePlans
      ),
    },
    {
      id: 'petsImportant',
      dimension: 'lifestyle',
      similarity: ordinalSimilarity(viewer.petsImportant, candidate.petsImportant),
    },
    {
      id: 'enjoyHosting',
      dimension: 'lifestyle',
      similarity: ordinalSimilarity(viewer.enjoyHosting, candidate.enjoyHosting),
    },
    {
      id: 'stayInTouchByText',
      dimension: 'communication',
      similarity: nearMatchSimilarity(viewer.stayInTouchByText, candidate.stayInTouchByText),
    },
    {
      id: 'preferDirectCommunication',
      dimension: 'communication',
      similarity: ordinalSimilarity(
        viewer.preferDirectCommunication,
        candidate.preferDirectCommunication
      ),
    },
    {
      id: 'followThroughOnPlans',
      dimension: 'communication',
      similarity: ordinalSimilarity(
        viewer.followThroughOnPlans,
        candidate.followThroughOnPlans
      ),
    },
    {
      id: 'appreciateCheckIns',
      dimension: 'communication',
      similarity: ordinalSimilarity(viewer.appreciateCheckIns, candidate.appreciateCheckIns),
    },
    {
      id: 'comfortableTalkingPersonal',
      dimension: 'communication',
      similarity: ordinalSimilarity(
        viewer.comfortableTalkingPersonal,
        candidate.comfortableTalkingPersonal
      ),
    },
    {
      id: 'preferTalkAboutIssues',
      dimension: 'communication',
      similarity: ordinalSimilarity(
        viewer.preferTalkAboutIssues,
        candidate.preferTalkAboutIssues
      ),
    },
    {
      id: 'valueKindnessInclusivity',
      dimension: 'values',
      similarity: ordinalSimilarity(
        viewer.valueKindnessInclusivity,
        candidate.valueKindnessInclusivity
      ),
    },
    {
      id: 'supportLocalCommunity',
      dimension: 'values',
      similarity: ordinalSimilarity(
        viewer.supportLocalCommunity,
        candidate.supportLocalCommunity
      ),
    },
    {
      id: 'givingBackMatters',
      dimension: 'values',
      similarity: ordinalSimilarity(viewer.givingBackMatters, candidate.givingBackMatters),
    },
    {
      id: 'personalGrowthMatters',
      dimension: 'values',
      similarity: ordinalSimilarity(
        viewer.personalGrowthMatters,
        candidate.personalGrowthMatters
      ),
    },
    {
      id: 'familyTimeImportant',
      dimension: 'values',
      similarity: ordinalSimilarity(viewer.familyTimeImportant, candidate.familyTimeImportant),
    },
    {
      id: 'enjoyPlayfulBanter',
      dimension: 'values',
      similarity: ordinalSimilarity(viewer.enjoyPlayfulBanter, candidate.enjoyPlayfulBanter),
    },
    {
      id: 'humorCanBeEdgy',
      dimension: 'values',
      similarity: ordinalSimilarity(viewer.humorCanBeEdgy, candidate.humorCanBeEdgy),
    },
    {
      id: 'wantEmotionalSupport',
      dimension: 'values',
      similarity: ordinalSimilarity(
        viewer.wantEmotionalSupport,
        candidate.wantEmotionalSupport
      ),
    },
  ]

  return items
}

function completeQuestionnaire(
  value: unknown
): FriendshipQuestionnaireComplete | null {
  const parsed = parseFriendshipQuestionnaire(value)
  if (!isFriendshipQuestionnaireComplete(parsed)) {
    return null
  }
  return parsed
}

export function scoreFriendshipPair(
  viewerQuestionnaire: unknown,
  candidateQuestionnaire: unknown
): FriendshipScoreResult {
  const viewer = completeQuestionnaire(viewerQuestionnaire)
  const candidate = completeQuestionnaire(candidateQuestionnaire)
  const breakdown: FriendshipScoreResult['breakdown'] = {
    version: FRIENDSHIP_SCORE_ALGORITHM_VERSION,
  }

  if (!viewer || !candidate) {
    breakdown.incomplete_questionnaire = 1
    return { score: 0, breakdown, reasons: [] }
  }

  const items = collectItems(viewer, candidate)
  const dimensionScores: Partial<Record<FriendshipDimensionId, number>> = {}
  const itemBreakdown: Record<string, number> = {}

  for (const dimension of Object.keys(
    FRIENDSHIP_BASE_DIMENSION_WEIGHTS
  ) as FriendshipDimensionId[]) {
    const similarities = items
      .filter((item) => item.dimension === dimension && item.similarity != null)
      .map((item) => item.similarity as number)

    const mean = average(similarities)
    if (mean != null) {
      dimensionScores[dimension] = mean
    }
  }

  for (const item of items) {
    if (item.similarity != null) {
      itemBreakdown[item.id] = Number(item.similarity.toFixed(4))
    }
  }

  breakdown.items = itemBreakdown

  const availableDimensions = (
    Object.keys(dimensionScores) as FriendshipDimensionId[]
  ).filter((dimension) => dimensionScores[dimension] != null)

  if (availableDimensions.length === 0) {
    breakdown.no_comparable_dimensions = 1
    return { score: 0, breakdown, reasons: [] }
  }

  const boosted = boostedDimensionWeights(viewer.friendshipPriorities)
  let weightTotal = 0
  for (const dimension of availableDimensions) {
    weightTotal += boosted[dimension]
  }

  const normalizedWeights: Record<string, number> = {}
  let weighted = 0
  for (const dimension of availableDimensions) {
    const weight = boosted[dimension] / weightTotal
    normalizedWeights[dimension] = Number(weight.toFixed(4))
    weighted += weight * (dimensionScores[dimension] ?? 0)
    breakdown[dimension] = Number((dimensionScores[dimension] ?? 0).toFixed(4))
  }

  breakdown.dimension_weights = normalizedWeights
  breakdown.viewer_priority_count = Math.min(3, viewer.friendshipPriorities.length)

  const score = Math.max(0, Math.min(100, Math.round(weighted * 100)))
  const reasons = deriveFriendshipMatchReasons(viewer, candidate)

  breakdown.reasons = reasons

  return { score, breakdown, reasons }
}
