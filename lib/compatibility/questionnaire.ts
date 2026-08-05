import {
  COMPATIBILITY_ORDINAL_QUESTION_IDS,
  COMPATIBILITY_QUESTIONNAIRE_QUESTIONS,
  COMPATIBILITY_QUESTIONNAIRE_VERSION,
  type CompatibilityQuestionDefinition,
} from '@/lib/compatibility/questionnaire-config'
import type {
  CompatibilityFamilySituation,
  CompatibilityGender,
  CompatibilityMatchInterest,
  CompatibilityOrdinalAnswer,
  CompatibilityQuestionnaire,
  CompatibilityQuestionnaireStored,
  CompatibilityQuestionnaireV1,
  CompatibilityQuestionnaireV2,
} from '@/lib/compatibility/types'

export type CompatibilityQuestionnaireAnswers = {
  gender: string
  genderSelfDescribe: string
  matchInterests: string[]
  relationshipIntention: number | null
  faithValues: number | null
  valuesVsChemistry: number | null
  partnershipDailyLife: number | null
  socialRhythm: number | null
  saturdayStyle: number | null
  planningSpontaneity: number | null
  ambition: number | null
  maritalHistory: number | null
  familySituation: string[]
  openToPartnerWithChildren: number | null
  futureChildren: number | null
  openToDivorced: number | null
  partnerHistoryPreference: number | null
  stayingActiveImportant: number | null
  enjoyDancingSocially: number | null
  enjoyEdgyHumor: number | null
  preferLowKeyHangouts: number | null
  needStructureOrganization: number | null
  spontaneousPlanReady: number | null
  preferOneOnOne: number | null
  sharedValuesOverHobbies: number | null
  likePlayfulBanter: number | null
  loveLanguagesImportant: number | null
  extendedFamilyTimeImportant: number | null
  enjoyHostingGatherings: number | null
  drinkAlcoholRegularly: number | null
  smokeRegularly: number | null
  animalCompanyImportant: number | null
}

const GENDER_VALUES = new Set<CompatibilityGender>([
  'woman',
  'man',
  'non_binary',
  'self_describe',
  'prefer_not_to_say',
])

const MATCH_INTEREST_VALUES = new Set<CompatibilityMatchInterest>([
  'women',
  'men',
  'non_binary',
  'open_to_all',
])

const FAMILY_SITUATION_VALUES = new Set<CompatibilityFamilySituation>([
  'no_children',
  'children_full_time',
  'children_part_time',
  'grown_children',
  'hope_future_children',
  'prefer_not_to_say',
])

function emptyAnswers(): CompatibilityQuestionnaireAnswers {
  return {
    gender: '',
    genderSelfDescribe: '',
    matchInterests: [],
    relationshipIntention: null,
    faithValues: null,
    valuesVsChemistry: null,
    partnershipDailyLife: null,
    socialRhythm: null,
    saturdayStyle: null,
    planningSpontaneity: null,
    ambition: null,
    maritalHistory: null,
    familySituation: [],
    openToPartnerWithChildren: null,
    futureChildren: null,
    openToDivorced: null,
    partnerHistoryPreference: null,
    stayingActiveImportant: null,
    enjoyDancingSocially: null,
    enjoyEdgyHumor: null,
    preferLowKeyHangouts: null,
    needStructureOrganization: null,
    spontaneousPlanReady: null,
    preferOneOnOne: null,
    sharedValuesOverHobbies: null,
    likePlayfulBanter: null,
    loveLanguagesImportant: null,
    extendedFamilyTimeImportant: null,
    enjoyHostingGatherings: null,
    drinkAlcoholRegularly: null,
    smokeRegularly: null,
    animalCompanyImportant: null,
  }
}

function isOrdinalAnswer(value: unknown): value is CompatibilityOrdinalAnswer {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
  )
}

function parseOrdinalField(
  record: Record<string, unknown>,
  key: string
): CompatibilityOrdinalAnswer | null {
  const value = record[key]
  return isOrdinalAnswer(value) ? value : null
}

function parseStringArrayField(
  record: Record<string, unknown>,
  key: string,
  allowed: Set<string>
): string[] {
  const value = record[key]
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .filter((item) => allowed.has(item))
}

export function parseCompatibilityQuestionnaire(
  value: unknown
): CompatibilityQuestionnaire | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  if (record.version === COMPATIBILITY_QUESTIONNAIRE_VERSION) {
    return record as CompatibilityQuestionnaireV2
  }

  if (record.version === 1) {
    return record as CompatibilityQuestionnaireV1
  }

  return null
}

export function questionnaireAnswersFromStored(
  value: unknown
): CompatibilityQuestionnaireAnswers {
  const answers = emptyAnswers()
  const parsed = parseCompatibilityQuestionnaire(value)

  if (!parsed) {
    return answers
  }

  if (parsed.version === COMPATIBILITY_QUESTIONNAIRE_VERSION) {
    const record = parsed as CompatibilityQuestionnaireStored
    if (record.gender) {
      answers.gender = record.gender
    }
    answers.genderSelfDescribe = record.genderSelfDescribe ?? ''
    answers.matchInterests = [...(record.matchInterests ?? [])]
    answers.familySituation = [...(record.familySituation ?? [])]
    for (const key of COMPATIBILITY_ORDINAL_QUESTION_IDS) {
      answers[key] = record[key] ?? null
    }
    return answers
  }

  if (typeof parsed.relationshipGoals === 'string') {
    answers.relationshipIntention = null
  }

  return answers
}

export function isLegacyTestQuestionnaire(
  questionnaire: CompatibilityQuestionnaire | null
): questionnaire is CompatibilityQuestionnaireV1 {
  return questionnaire?.version === 1
}

export function isQuestionnaireComplete(
  questionnaire: CompatibilityQuestionnaire | null
): questionnaire is CompatibilityQuestionnaireV2 {
  if (!questionnaire || questionnaire.version !== COMPATIBILITY_QUESTIONNAIRE_VERSION) {
    return false
  }

  const record = questionnaire as CompatibilityQuestionnaireStored

  if (!record.gender || !GENDER_VALUES.has(record.gender)) {
    return false
  }

  if (
    record.gender === 'self_describe' &&
    !record.genderSelfDescribe?.trim()
  ) {
    return false
  }

  if (!record.matchInterests || record.matchInterests.length === 0) {
    return false
  }

  if (
    record.matchInterests.includes('open_to_all') &&
    record.matchInterests.length > 1
  ) {
    return false
  }

  for (const key of COMPATIBILITY_ORDINAL_QUESTION_IDS) {
    if (!isOrdinalAnswer(record[key])) {
      return false
    }
  }

  const familySelections = record.familySituation ?? []
  if (familySelections.length === 0) {
    return false
  }

  if (
    familySelections.length === 1 &&
    familySelections[0] === 'prefer_not_to_say'
  ) {
    return false
  }

  return true
}

export function isCompatibilityQuestionnaireEffectivelyComplete(input: {
  compatibility_questionnaire?: unknown
  compatibility_completed_at?: string | null
}): boolean {
  const questionnaire = parseCompatibilityQuestionnaire(
    input.compatibility_questionnaire
  )
  return (
    input.compatibility_completed_at != null && isQuestionnaireComplete(questionnaire)
  )
}

export function questionnaireHasAnyAnswers(value: unknown): boolean {
  const parsed = parseCompatibilityQuestionnaire(value)
  if (isLegacyTestQuestionnaire(parsed)) {
    return true
  }

  const answers = questionnaireAnswersFromStored(value)
  return (
    Boolean(answers.gender) ||
    answers.matchInterests.length > 0 ||
    answers.familySituation.length > 0 ||
    COMPATIBILITY_ORDINAL_QUESTION_IDS.some((key) => answers[key] != null)
  )
}

export function normalizeMatchInterests(
  values: string[]
): CompatibilityMatchInterest[] {
  const filtered = values.filter((value): value is CompatibilityMatchInterest =>
    MATCH_INTEREST_VALUES.has(value as CompatibilityMatchInterest)
  )

  if (filtered.includes('open_to_all')) {
    return ['open_to_all']
  }

  return [...new Set(filtered)]
}

export function normalizeFamilySituation(
  values: string[]
): CompatibilityFamilySituation[] {
  return [
    ...new Set(
      values.filter((value): value is CompatibilityFamilySituation =>
        FAMILY_SITUATION_VALUES.has(value as CompatibilityFamilySituation)
      )
    ),
  ]
}

export function buildCompatibilityQuestionnaire(
  input: CompatibilityQuestionnaireAnswers,
  existing?: CompatibilityQuestionnaire | null
): CompatibilityQuestionnaireStored {
  const stored: CompatibilityQuestionnaireStored =
    existing?.version === COMPATIBILITY_QUESTIONNAIRE_VERSION
      ? { ...existing, version: COMPATIBILITY_QUESTIONNAIRE_VERSION }
      : { version: COMPATIBILITY_QUESTIONNAIRE_VERSION }

  if (GENDER_VALUES.has(input.gender as CompatibilityGender)) {
    const gender = input.gender as CompatibilityGender
    stored.gender = gender
    stored.genderSelfDescribe =
      gender === 'self_describe'
        ? input.genderSelfDescribe.trim() || null
        : null
  }

  stored.matchInterests = normalizeMatchInterests(input.matchInterests)
  stored.familySituation = normalizeFamilySituation(input.familySituation)

  for (const key of COMPATIBILITY_ORDINAL_QUESTION_IDS) {
    const value = input[key]
    if (isOrdinalAnswer(value)) {
      stored[key] = value
    }
  }

  if (existing?.version === 1) {
    if (existing.relationshipGoals?.trim()) {
      stored.legacyRelationshipGoals = existing.relationshipGoals.trim()
    }
    if (existing.communicationStyle?.trim()) {
      stored.legacyCommunicationStyle = existing.communicationStyle.trim()
    }
  } else if (existing?.version === COMPATIBILITY_QUESTIONNAIRE_VERSION) {
    if (existing.legacyRelationshipGoals) {
      stored.legacyRelationshipGoals = existing.legacyRelationshipGoals
    }
    if (existing.legacyCommunicationStyle) {
      stored.legacyCommunicationStyle = existing.legacyCommunicationStyle
    }
  }

  return stored
}

export function validateQuestionnaireAnswersForSave(
  input: CompatibilityQuestionnaireAnswers,
  complete: boolean,
  existing?: CompatibilityQuestionnaire | null
): { questionnaire: CompatibilityQuestionnaireStored } | { error: string } {
  const questionnaire = buildCompatibilityQuestionnaire(input, existing)

  if (!complete) {
    return { questionnaire }
  }

  if (!isQuestionnaireComplete(questionnaire)) {
    return {
      error:
        questionnaireValidationMessage(questionnaire) ??
        'Please answer every required question before completing the questionnaire.',
    }
  }

  return { questionnaire }
}

export function missingRequiredQuestionPrompts(
  questionnaire: CompatibilityQuestionnaire | CompatibilityQuestionnaireStored | null
): string[] {
  const answers = questionnaireAnswersFromStored(questionnaire)
  const missing: string[] = []

  for (const question of COMPATIBILITY_QUESTIONNAIRE_QUESTIONS) {
    if (!question.required) {
      continue
    }

    if (
      question.visibleWhen &&
      answers[question.visibleWhen.field as keyof CompatibilityQuestionnaireAnswers] !==
        question.visibleWhen.value
    ) {
      continue
    }

    if (question.type === 'text') {
      if (!answers.genderSelfDescribe.trim()) {
        missing.push(question.prompt)
      }
      continue
    }

    if (question.type === 'multi') {
      const values =
        question.id === 'matchInterests'
          ? answers.matchInterests
          : answers.familySituation

      if (values.length === 0) {
        missing.push(question.prompt)
        continue
      }

      if (
        question.id === 'familySituation' &&
        values.length === 1 &&
        values[0] === 'prefer_not_to_say'
      ) {
        missing.push(
          `${question.prompt} (select at least one option besides "Prefer not to say")`
        )
      }

      continue
    }

    if (question.type === 'single' || question.type === 'scale') {
      const value = answers[question.id as keyof CompatibilityQuestionnaireAnswers]
      if (value == null || value === '') {
        missing.push(question.prompt)
      }
      continue
    }

    const value = answers[question.id as keyof CompatibilityQuestionnaireAnswers]
    if (value == null || value === '') {
      missing.push(question.prompt)
    }
  }

  return missing
}

export function questionnaireValidationErrors(
  questionnaire: CompatibilityQuestionnaireStored
): string[] {
  const errors = missingRequiredQuestionPrompts(questionnaire)

  if (
    questionnaire.matchInterests?.includes('open_to_all') &&
    (questionnaire.matchInterests?.length ?? 0) > 1
  ) {
    errors.push(
      '“Open to all genders” cannot be combined with other match-interest options.'
    )
  }

  return errors
}

export function questionnaireValidationMessage(
  questionnaire: CompatibilityQuestionnaireStored
): string | null {
  const errors = questionnaireValidationErrors(questionnaire)
  if (errors.length === 0) {
    return null
  }

  if (errors.length === 1) {
    return `Please complete this before finishing: ${errors[0]}`
  }

  return `Please complete the following before finishing: ${errors.join('; ')}`
}

export type CompatibilityQuestionnaireState =
  | 'empty'
  | 'legacy_v1'
  | 'in_progress'
  | 'complete'

export function resolveCompatibilityQuestionnaireState(input: {
  compatibility_questionnaire?: unknown
  compatibility_completed_at?: string | null
}): CompatibilityQuestionnaireState {
  const questionnaire = parseCompatibilityQuestionnaire(
    input.compatibility_questionnaire
  )

  if (!questionnaire) {
    return 'empty'
  }

  if (isLegacyTestQuestionnaire(questionnaire)) {
    return 'legacy_v1'
  }

  if (isCompatibilityQuestionnaireEffectivelyComplete(input)) {
    return 'complete'
  }

  if (questionnaireHasAnyAnswers(input.compatibility_questionnaire)) {
    return 'in_progress'
  }

  return 'empty'
}

export function getQuestionDefinition(
  questionId: string
): CompatibilityQuestionDefinition | undefined {
  return COMPATIBILITY_QUESTIONNAIRE_QUESTIONS.find(
    (question) => question.id === questionId
  )
}

/** @deprecated Legacy Phase 1 scaffold accessor. */
export function questionnaireRelationshipGoals(
  questionnaire: CompatibilityQuestionnaire | null
): string {
  if (!questionnaire) {
    return ''
  }

  if (questionnaire.version === COMPATIBILITY_QUESTIONNAIRE_VERSION) {
    return questionnaire.legacyRelationshipGoals?.trim() ?? ''
  }

  return questionnaire.relationshipGoals?.trim() ?? ''
}

/** @deprecated Legacy Phase 1 scaffold accessor. */
export function questionnaireCommunicationStyle(
  questionnaire: CompatibilityQuestionnaire | null
): string {
  if (!questionnaire) {
    return ''
  }

  if (questionnaire.version === COMPATIBILITY_QUESTIONNAIRE_VERSION) {
    return questionnaire.legacyCommunicationStyle?.trim() ?? ''
  }

  return questionnaire.communicationStyle?.trim() ?? ''
}

export function questionnaireV2(
  questionnaire: CompatibilityQuestionnaire | null
): CompatibilityQuestionnaireV2 | null {
  return isQuestionnaireComplete(questionnaire) ? questionnaire : null
}
