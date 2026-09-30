import { SCORE_ALGORITHM_VERSION } from '@/lib/compatibility/generation-config'
import { passesCompatibilityHardFilters } from '@/lib/compatibility/match-hard-filters'
import {
  parseCompatibilityQuestionnaire,
  questionnaireV2,
} from '@/lib/compatibility/questionnaire'
import {
  ALIGNMENT_IMPORTANCE_QUESTION_IDS,
  COMPATIBILITY_ORDINAL_QUESTION_IDS,
  type AlignmentImportanceQuestionId,
  type CompatibilityOrdinalQuestionId,
} from '@/lib/compatibility/questionnaire-config'
import type { CompatibilityQuestionnaireComplete } from '@/lib/compatibility/types'

export type ScorableMemberProfile = {
  compatibility_questionnaire: unknown
  discovery_interests: string[] | null
  location_area: string | null
  birth_year: number | null
}

export type CompatibilityScoreResult = {
  score: number
  breakdown: Record<string, number | string>
}

const ORDINAL_WEIGHTS: Partial<Record<CompatibilityOrdinalQuestionId, number>> =
  {
    relationshipIntention: 12,
    valuesVsChemistry: 8,
    partnershipDailyLife: 8,
    socialRhythm: 7,
    saturdayStyle: 6,
    planningSpontaneity: 6,
    ambition: 5,
    partnerHistoryPreference: 5,
    openToPartnerWithChildren: 4,
    futureChildren: 4,
    openToDivorced: 3,
    maritalHistory: 2,
    stayingActiveImportant: 2,
    enjoyDancingSocially: 1,
    enjoyEdgyHumor: 1,
    preferLowKeyHangouts: 2,
    needStructureOrganization: 1,
    spontaneousPlanReady: 1,
    preferOneOnOne: 1,
    sharedValuesOverHobbies: 2,
    likePlayfulBanter: 1,
    loveLanguagesImportant: 1,
    extendedFamilyTimeImportant: 2,
    enjoyHostingGatherings: 1,
    drinkAlcoholRegularly: 2,
    smokeRegularly: 2,
    animalCompanyImportant: 1,
  }

function ordinalSimilarityPoints(
  left: number,
  right: number,
  maxPoints: number
): number {
  const distance = Math.abs(left - right)
  if (distance === 0) {
    return maxPoints
  }
  if (distance === 1) {
    return Math.round(maxPoints * 0.75)
  }
  if (distance === 2) {
    return Math.round(maxPoints * 0.45)
  }
  if (distance === 3) {
    return Math.round(maxPoints * 0.2)
  }
  return 0
}

function sharedInterestPoints(
  left: string[] | null | undefined,
  right: string[] | null | undefined,
  maxPoints: number
): number {
  const a = new Set((left ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean))
  const b = new Set((right ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean))
  if (a.size === 0 || b.size === 0) {
    return 0
  }

  let shared = 0
  for (const item of a) {
    if (b.has(item)) {
      shared++
    }
  }

  return Math.min(maxPoints, shared * 5)
}

function ageProximityPoints(
  left: number | null | undefined,
  right: number | null | undefined
): number {
  if (left == null || right == null) {
    return 0
  }

  const diff = Math.abs(left - right)
  if (diff <= 3) {
    return 8
  }
  if (diff <= 7) {
    return 4
  }
  return 0
}

const ALIGNMENT_CAUTION_LABELS: Record<AlignmentImportanceQuestionId, string> = {
  shared_faith_importance: 'Large difference in how important shared faith is',
  core_values_alignment_importance:
    'Large difference in how important core-value alignment is',
  shared_worldview_importance:
    'Large difference in how important a similar worldview is',
}

function readOrdinal(
  questionnaire: CompatibilityQuestionnaireComplete,
  key: string
): number | null {
  const value = (questionnaire as Record<string, unknown>)[key]
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5
    ? value
    : null
}

function importanceWeight(level: number): number {
  if (level >= 5) return 12
  if (level >= 3) return 8
  return 3
}

/** Compares how important alignment is. It does not describe anyone's beliefs. */
export function alignmentImportancePoints(left: number, right: number): number {
  const weight = Math.max(importanceWeight(left), importanceWeight(right))
  const distance = Math.abs(left - right)
  if (distance === 0) return weight
  if (distance === 1) return Math.round(weight * 0.8)
  if (distance === 2) return Math.round(weight * 0.4)
  if (distance === 3) return Math.round(weight * 0.15)
  return Math.round(weight * 0.05)
}

function hasAllAlignmentAnswers(
  questionnaire: CompatibilityQuestionnaireComplete
): boolean {
  return ALIGNMENT_IMPORTANCE_QUESTION_IDS.every(
    (key) => readOrdinal(questionnaire, key) != null
  )
}

/**
 * Pulls a capped score back down when importance differs.
 * One answer cannot drop an otherwise full score below the recommendation minimum.
 */
function alignmentScorePenalty(
  viewer: CompatibilityQuestionnaireComplete,
  candidate: CompatibilityQuestionnaireComplete
): number {
  if (!hasAllAlignmentAnswers(viewer) || !hasAllAlignmentAnswers(candidate)) {
    return 0
  }

  let penalty = 0
  for (const key of ALIGNMENT_IMPORTANCE_QUESTION_IDS) {
    const left = readOrdinal(viewer, key)!
    const right = readOrdinal(candidate, key)!
    const distance = Math.abs(left - right)
    const importance = Math.max(left, right)
    if (distance <= 1 || importance <= 2) {
      continue
    }
    if (importance >= 5 && distance >= 3) {
      penalty += 18
    } else if (importance >= 5) {
      penalty += 8
    } else if (distance >= 3) {
      penalty += 10
    } else {
      penalty += 4
    }
  }

  return Math.min(penalty, 25)
}

function scoreAlignmentImportance(
  viewer: CompatibilityQuestionnaireComplete,
  candidate: CompatibilityQuestionnaireComplete,
  breakdown: Record<string, number | string>
): number {
  if (hasAllAlignmentAnswers(viewer) && hasAllAlignmentAnswers(candidate)) {
    let points = 0
    const cautions: string[] = []

    for (const key of ALIGNMENT_IMPORTANCE_QUESTION_IDS) {
      const left = readOrdinal(viewer, key)!
      const right = readOrdinal(candidate, key)!
      const questionPoints = alignmentImportancePoints(left, right)
      breakdown[key] = questionPoints
      points += questionPoints

      const distance = Math.abs(left - right)
      if (distance >= 3 && Math.max(left, right) >= 3) {
        cautions.push(ALIGNMENT_CAUTION_LABELS[key])
      }
    }

    if (cautions.length > 0) {
      breakdown.alignment_caution = cautions.join('; ')
    }
    return points
  }

  const viewerFaith = readOrdinal(viewer, 'faithValues')
  const candidateFaith = readOrdinal(candidate, 'faithValues')
  if (viewerFaith != null && candidateFaith != null) {
    const questionPoints = ordinalSimilarityPoints(viewerFaith, candidateFaith, 10)
    breakdown.faithValues = questionPoints
    return questionPoints
  }

  breakdown.alignment_unscored = 1
  return 0
}

function scoreOrdinalDimensions(
  viewer: CompatibilityQuestionnaireComplete,
  candidate: CompatibilityQuestionnaireComplete,
  breakdown: Record<string, number | string>
): number {
  let points = 0

  for (const key of COMPATIBILITY_ORDINAL_QUESTION_IDS) {
    const weight = ORDINAL_WEIGHTS[key] ?? 0
    if (weight === 0) {
      continue
    }

    const left = readOrdinal(viewer, key)
    const right = readOrdinal(candidate, key)
    if (left == null || right == null) {
      continue
    }

    const questionPoints = ordinalSimilarityPoints(left, right, weight)
    breakdown[key] = questionPoints
    points += questionPoints
  }

  points += scoreAlignmentImportance(viewer, candidate, breakdown)
  return points
}

export function scoreCompatibilityPair(
  viewer: ScorableMemberProfile,
  candidate: ScorableMemberProfile
): CompatibilityScoreResult {
  const viewerQuestionnaire = questionnaireV2(
    parseCompatibilityQuestionnaire(viewer.compatibility_questionnaire)
  )
  const candidateQuestionnaire = questionnaireV2(
    parseCompatibilityQuestionnaire(candidate.compatibility_questionnaire)
  )

  const breakdown: Record<string, number | string> = {
    version: SCORE_ALGORITHM_VERSION,
    baseline: 0,
  }

  if (!viewerQuestionnaire || !candidateQuestionnaire) {
    breakdown.incomplete_questionnaire = 1
    return { score: 0, breakdown }
  }

  if (!passesCompatibilityHardFilters(viewerQuestionnaire, candidateQuestionnaire)) {
    breakdown.hard_filter_failed = 1
    return { score: 0, breakdown }
  }

  let score = 20
  breakdown.baseline = 20

  score += scoreOrdinalDimensions(
    viewerQuestionnaire,
    candidateQuestionnaire,
    breakdown
  )

  const interestPoints = sharedInterestPoints(
    viewer.discovery_interests,
    candidate.discovery_interests,
    10
  )
  breakdown.shared_interests = interestPoints
  score += interestPoints

  const locationPoints =
    viewer.location_area &&
    candidate.location_area &&
    viewer.location_area.trim().toLowerCase() ===
      candidate.location_area.trim().toLowerCase()
      ? 8
      : 0
  breakdown.location = locationPoints
  score += locationPoints

  const agePoints = ageProximityPoints(viewer.birth_year, candidate.birth_year)
  breakdown.age_proximity = agePoints
  score += agePoints

  const capped = Math.min(100, Math.round(score))
  const alignmentPenalty = alignmentScorePenalty(
    viewerQuestionnaire,
    candidateQuestionnaire
  )
  if (alignmentPenalty > 0) {
    breakdown.alignment_penalty = alignmentPenalty
  }

  return {
    score: Math.max(0, capped - alignmentPenalty),
    breakdown,
  }
}
