import {
  FRIENDSHIP_EXPANDABLE_GOAL_VALUES,
  FRIENDSHIP_GOAL_VALUES,
  FRIENDSHIP_HANGOUT_VALUES,
  FRIENDSHIP_ORDINAL_QUESTION_IDS,
  FRIENDSHIP_PREFER_NOT_TO_ANSWER,
  FRIENDSHIP_PRIORITY_VALUES,
  FRIENDSHIP_QUESTIONNAIRE_QUESTIONS,
  FRIENDSHIP_QUESTIONNAIRE_VERSION,
  FRIENDSHIP_TIME_VALUES,
  type FriendshipQuestionDefinition,
} from '@/lib/friendship/questionnaire-config'
import type {
  FriendshipOrdinalAnswer,
  FriendshipQuestionnaireAnswers,
  FriendshipQuestionnaireComplete,
  FriendshipQuestionnaireRow,
  FriendshipQuestionnaireStored,
} from '@/lib/friendship/types'

export type { FriendshipQuestionnaireAnswers }

const GOAL_SET = new Set(FRIENDSHIP_GOAL_VALUES)
const HANGOUT_SET = new Set(FRIENDSHIP_HANGOUT_VALUES)
const PRIORITY_SET = new Set(FRIENDSHIP_PRIORITY_VALUES)
const TIME_SET = new Set(FRIENDSHIP_TIME_VALUES)
const ALCOHOL_FREQUENCY_SET = new Set([
  'never',
  'rarely',
  'occasionally',
  'often',
  FRIENDSHIP_PREFER_NOT_TO_ANSWER,
])
const ALCOHOL_COMFORT_SET = new Set([
  'not_comfortable',
  'sometimes',
  'comfortable',
  'very_comfortable',
  FRIENDSHIP_PREFER_NOT_TO_ANSWER,
])

export function emptyFriendshipAnswers(): FriendshipQuestionnaireAnswers {
  return {
    friendshipGoals: [],
    desiredTimeTogether: '',
    longTermMeaningful: null,
    wideCircleAndDeep: null,
    rechargeWithPeople: null,
    preferOneOnOne: null,
    enjoyRegularFriendGroup: null,
    likeMeetingNewPeople: null,
    preferSpontaneousPlans: null,
    comfortableInitiating: null,
    idealHangouts: [],
    stayActiveOutside: null,
    enjoyLowKeyHangouts: null,
    likeNightlife: null,
    preferStructuredSchedule: null,
    openToLastMinutePlans: null,
    alcoholFrequency: '',
    alcoholComfort: '',
    petsImportant: null,
    enjoyHosting: null,
    stayInTouchByText: null,
    preferDirectCommunication: null,
    followThroughOnPlans: null,
    appreciateCheckIns: null,
    comfortableTalkingPersonal: null,
    preferTalkAboutIssues: null,
    valueKindnessInclusivity: null,
    supportLocalCommunity: null,
    givingBackMatters: null,
    personalGrowthMatters: null,
    familyTimeImportant: null,
    enjoyPlayfulBanter: null,
    humorCanBeEdgy: null,
    wantEmotionalSupport: null,
    friendshipPriorities: [],
  }
}

export function isFriendshipOrdinalAnswer(
  value: unknown
): value is FriendshipOrdinalAnswer {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
  )
}

function parseStringArray(value: unknown, allowed: Set<string>): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return [
    ...new Set(
      value.filter(
        (item): item is string => typeof item === 'string' && allowed.has(item)
      )
    ),
  ]
}

export function parseFriendshipQuestionnaire(
  value: unknown
): FriendshipQuestionnaireStored | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  if (record.version !== FRIENDSHIP_QUESTIONNAIRE_VERSION) {
    return null
  }

  return record as FriendshipQuestionnaireStored
}

export function friendshipAnswersFromStored(
  value: unknown
): FriendshipQuestionnaireAnswers {
  const answers = emptyFriendshipAnswers()
  const parsed = parseFriendshipQuestionnaire(value)
  if (!parsed) {
    return answers
  }

  answers.friendshipGoals = parseStringArray(parsed.friendshipGoals, GOAL_SET)
  answers.idealHangouts = parseStringArray(parsed.idealHangouts, HANGOUT_SET)
  answers.friendshipPriorities = parseStringArray(
    parsed.friendshipPriorities,
    PRIORITY_SET
  )

  if (
    typeof parsed.desiredTimeTogether === 'string' &&
    TIME_SET.has(parsed.desiredTimeTogether)
  ) {
    answers.desiredTimeTogether = parsed.desiredTimeTogether
  }

  if (
    typeof parsed.alcoholFrequency === 'string' &&
    ALCOHOL_FREQUENCY_SET.has(parsed.alcoholFrequency)
  ) {
    answers.alcoholFrequency = parsed.alcoholFrequency
  }

  if (
    typeof parsed.alcoholComfort === 'string' &&
    ALCOHOL_COMFORT_SET.has(parsed.alcoholComfort)
  ) {
    answers.alcoholComfort = parsed.alcoholComfort
  }

  for (const key of FRIENDSHIP_ORDINAL_QUESTION_IDS) {
    const valueForKey = parsed[key as keyof FriendshipQuestionnaireStored]
    ;(answers as Record<string, unknown>)[key] = isFriendshipOrdinalAnswer(valueForKey)
      ? valueForKey
      : null
  }

  return answers
}

export function normalizeFriendshipGoals(values: string[]): string[] {
  const filtered = parseStringArray(values, GOAL_SET)
  if (filtered.includes('mix_all')) {
    return ['mix_all']
  }
  return filtered
}

export function expandFriendshipGoalsForScoring(values: string[]): string[] {
  const normalized = normalizeFriendshipGoals(values)
  if (normalized.includes('mix_all')) {
    return [...FRIENDSHIP_EXPANDABLE_GOAL_VALUES]
  }
  return normalized
}

export function normalizeHangouts(values: string[], max = 3): string[] {
  return parseStringArray(values, HANGOUT_SET).slice(0, max)
}

export function normalizePriorities(values: string[], max = 3): string[] {
  return parseStringArray(values, PRIORITY_SET).slice(0, max)
}

export function isSensitiveUnanswered(value: string | null | undefined): boolean {
  return !value || value === FRIENDSHIP_PREFER_NOT_TO_ANSWER
}

export function buildFriendshipQuestionnaire(
  input: FriendshipQuestionnaireAnswers
): FriendshipQuestionnaireStored {
  const stored: FriendshipQuestionnaireStored = {
    version: FRIENDSHIP_QUESTIONNAIRE_VERSION,
  }

  stored.friendshipGoals = normalizeFriendshipGoals(input.friendshipGoals)
  stored.idealHangouts = normalizeHangouts(input.idealHangouts)
  stored.friendshipPriorities = normalizePriorities(input.friendshipPriorities)

  if (TIME_SET.has(input.desiredTimeTogether)) {
    stored.desiredTimeTogether = input.desiredTimeTogether
  }

  if (ALCOHOL_FREQUENCY_SET.has(input.alcoholFrequency)) {
    stored.alcoholFrequency = input.alcoholFrequency
  }

  if (ALCOHOL_COMFORT_SET.has(input.alcoholComfort)) {
    stored.alcoholComfort = input.alcoholComfort
  }

  for (const key of FRIENDSHIP_ORDINAL_QUESTION_IDS) {
    const value = input[key as keyof FriendshipQuestionnaireAnswers]
    if (isFriendshipOrdinalAnswer(value)) {
      stored[key as keyof FriendshipQuestionnaireStored] = value as never
    }
  }

  return stored
}

function questionAnswered(
  question: FriendshipQuestionDefinition,
  answers: FriendshipQuestionnaireAnswers
): boolean {
  if (question.type === 'multi') {
    const values = answers[question.id as keyof FriendshipQuestionnaireAnswers]
    if (!Array.isArray(values) || values.length === 0) {
      return false
    }
    if (question.maxSelections && values.length > question.maxSelections) {
      return false
    }
    return true
  }

  const value = answers[question.id as keyof FriendshipQuestionnaireAnswers]
  if (question.type === 'scale') {
    return isFriendshipOrdinalAnswer(value)
  }

  return typeof value === 'string' && value.length > 0
}

export function missingFriendshipQuestionPrompts(
  answers: FriendshipQuestionnaireAnswers
): string[] {
  const missing: string[] = []

  for (const question of FRIENDSHIP_QUESTIONNAIRE_QUESTIONS) {
    if (!question.required) {
      continue
    }
    if (!questionAnswered(question, answers)) {
      if (question.maxSelections) {
        missing.push(`${question.prompt} (choose up to ${question.maxSelections})`)
      } else {
        missing.push(question.prompt)
      }
    }
  }

  return missing
}

export function isFriendshipQuestionnaireComplete(
  questionnaire: FriendshipQuestionnaireStored | null
): questionnaire is FriendshipQuestionnaireComplete {
  if (!questionnaire || questionnaire.version !== FRIENDSHIP_QUESTIONNAIRE_VERSION) {
    return false
  }

  const answers = friendshipAnswersFromStored(questionnaire)
  return missingFriendshipQuestionPrompts(answers).length === 0
}

export function friendshipQuestionnaireHasAnyAnswers(value: unknown): boolean {
  const answers = friendshipAnswersFromStored(value)
  return (
    answers.friendshipGoals.length > 0 ||
    answers.idealHangouts.length > 0 ||
    answers.friendshipPriorities.length > 0 ||
    Boolean(answers.desiredTimeTogether) ||
    Boolean(answers.alcoholFrequency) ||
    Boolean(answers.alcoholComfort) ||
    FRIENDSHIP_ORDINAL_QUESTION_IDS.some(
      (key) => answers[key as keyof FriendshipQuestionnaireAnswers] != null
    )
  )
}

export function isFriendshipQuestionnaireSubmitted(input: {
  answers?: unknown
  status?: string | null
  completed_at?: string | null
}): boolean {
  if (input.status !== 'submitted' || input.completed_at == null) {
    return false
  }

  return isFriendshipQuestionnaireComplete(parseFriendshipQuestionnaire(input.answers))
}

export function resolveFriendshipQuestionnaireState(row: {
  answers?: unknown
  status?: string | null
  completed_at?: string | null
} | null): 'empty' | 'in_progress' | 'complete' {
  if (!row || !parseFriendshipQuestionnaire(row.answers)) {
    return friendshipQuestionnaireHasAnyAnswers(row?.answers) ? 'in_progress' : 'empty'
  }

  if (isFriendshipQuestionnaireSubmitted(row)) {
    return 'complete'
  }

  if (friendshipQuestionnaireHasAnyAnswers(row.answers)) {
    return 'in_progress'
  }

  return 'empty'
}

export function validateFriendshipAnswersForSave(
  input: FriendshipQuestionnaireAnswers,
  complete: boolean
): { questionnaire: FriendshipQuestionnaireStored } | { error: string } {
  const questionnaire = buildFriendshipQuestionnaire(input)

  if (!complete) {
    return { questionnaire }
  }

  const errors = missingFriendshipQuestionPrompts(
    friendshipAnswersFromStored(questionnaire)
  )
  if (errors.length > 0) {
    if (errors.length === 1) {
      return {
        error: `Please complete this before finishing: ${errors[0]}`,
      }
    }
    return {
      error: `Please complete the following before finishing: ${errors.join('; ')}`,
    }
  }

  return { questionnaire }
}

export function friendshipQuestionnaireFromRow(
  row: FriendshipQuestionnaireRow | null
): FriendshipQuestionnaireStored | null {
  return parseFriendshipQuestionnaire(row?.answers ?? null)
}
