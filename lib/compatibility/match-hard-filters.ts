import type {
  CompatibilityFamilySituation,
  CompatibilityGender,
  CompatibilityQuestionnaireV2,
} from '@/lib/compatibility/types'
import {
  isQuestionnaireComplete,
  questionnaireV2,
} from '@/lib/compatibility/questionnaire'
import { isMutualDatingAgeMatch } from '@/lib/compatibility/age-preferences'

type QuestionnaireProfile = {
  compatibility_questionnaire: unknown
}

function genderMatchCategory(
  gender: CompatibilityGender
): 'women' | 'men' | 'non_binary' | null {
  switch (gender) {
    case 'woman':
      return 'women'
    case 'man':
      return 'men'
    case 'non_binary':
    case 'self_describe':
      return 'non_binary'
    default:
      return null
  }
}

export function hasMutualGenderInterest(
  left: CompatibilityQuestionnaireV2,
  right: CompatibilityQuestionnaireV2
): boolean {
  const leftCategory = genderMatchCategory(left.gender)
  const rightCategory = genderMatchCategory(right.gender)

  if (!leftCategory || !rightCategory) {
    return false
  }

  const leftInterestedInRight =
    left.matchInterests.includes('open_to_all') ||
    left.matchInterests.includes(rightCategory)

  const rightInterestedInLeft =
    right.matchInterests.includes('open_to_all') ||
    right.matchInterests.includes(leftCategory)

  return leftInterestedInRight && rightInterestedInLeft
}

function partnerHasChildrenNow(
  familySituation: CompatibilityFamilySituation[]
): boolean {
  return familySituation.some((value) =>
    ['children_full_time', 'children_part_time', 'grown_children'].includes(value)
  )
}

function isDivorced(maritalHistory: number): boolean {
  return maritalHistory === 3
}

function opennessAllows(
  openness: number,
  strictness: 'hard' | 'soft' = 'hard'
): boolean {
  if (strictness === 'soft') {
    return openness >= 3
  }
  return openness >= 4
}

export function passesCompatibilityHardFilters(
  viewer: CompatibilityQuestionnaireV2,
  candidate: CompatibilityQuestionnaireV2
): boolean {
  if (!isMutualDatingAgeMatch(viewer, candidate)) {
    return false
  }

  if (!hasMutualGenderInterest(viewer, candidate)) {
    return false
  }

  const viewerCasual = viewer.relationshipIntention === 5
  const candidateCasual = candidate.relationshipIntention === 5
  const viewerMarriageFocused = viewer.relationshipIntention <= 2
  const candidateMarriageFocused = candidate.relationshipIntention <= 2

  if (
    (viewerCasual && candidateMarriageFocused) ||
    (candidateCasual && viewerMarriageFocused)
  ) {
    return false
  }

  const candidateHasChildren = partnerHasChildrenNow(candidate.familySituation)
  if (candidateHasChildren && viewer.openToPartnerWithChildren <= 2) {
    return false
  }

  const viewerHasChildren = partnerHasChildrenNow(viewer.familySituation)
  if (viewerHasChildren && candidate.openToPartnerWithChildren <= 2) {
    return false
  }

  if (viewer.futureChildren === 5 && candidate.futureChildren <= 2) {
    return false
  }

  if (candidate.futureChildren === 5 && viewer.futureChildren <= 2) {
    return false
  }

  if (isDivorced(candidate.maritalHistory) && viewer.openToDivorced <= 2) {
    return false
  }

  if (isDivorced(viewer.maritalHistory) && candidate.openToDivorced <= 2) {
    return false
  }

  if (
    viewer.partnerHistoryPreference === 1 &&
    candidate.maritalHistory !== 1 &&
    candidate.maritalHistory !== 5
  ) {
    return false
  }

  if (
    candidate.partnerHistoryPreference === 1 &&
    viewer.maritalHistory !== 1 &&
    viewer.maritalHistory !== 5
  ) {
    return false
  }

  return true
}

export function passesCompatibilityMatchingPipeline(
  viewerProfile: QuestionnaireProfile,
  candidateProfile: QuestionnaireProfile
): boolean {
  const viewer = questionnaireV2(
    viewerProfile.compatibility_questionnaire as never
  )
  const candidate = questionnaireV2(
    candidateProfile.compatibility_questionnaire as never
  )

  if (!viewer || !candidate) {
    return false
  }

  if (
    !isQuestionnaireComplete(viewer) ||
    !isQuestionnaireComplete(candidate)
  ) {
    return false
  }

  return passesCompatibilityHardFilters(viewer, candidate)
}
