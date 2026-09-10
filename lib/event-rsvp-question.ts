/**
 * v1 Event RSVP question: one optional free-text question per event,
 * and one answer per member RSVP (not a guest answer).
 *
 * Migration: supabase/migrations/20260910000000_event_rsvp_question.sql
 * Paid checkout staging: supabase/migrations/20260910010000_event_rsvp_pending_answers.sql
 */

export const RSVP_QUESTION_MAX_CHARS = 300
export const RSVP_ANSWER_MAX_CHARS = 500

export const RSVP_QUESTION_SECTION_HEADING = 'RSVP question (optional)'
export const RSVP_QUESTION_SECTION_HELPER =
  'Ask guests one question when they RSVP.'
export const RSVP_QUESTION_FIELD_LABEL = 'Question'
export const RSVP_QUESTION_REQUIRED_LABEL =
  'Require guests to answer this question to RSVP'
export const RSVP_QUESTION_HOST_GUIDANCE =
  'Ask only for information needed to plan this event. Do not request sensitive personal, medical, financial, government-ID, or login information. Guests’ answers are visible to the event host and Huntsville Social Club administrators.'

export const RSVP_ANSWER_OPTIONAL_LABEL = 'Optional'
export const RSVP_ANSWER_REQUIRED_HELP = 'Your answer is required to RSVP.'
export const RSVP_ANSWER_PRIVACY_COPY =
  'Your response will be shared with the event host and Huntsville Social Club administrators for this event.'

export const RSVP_QUESTION_TOO_LONG_MESSAGE = `RSVP question must be ${RSVP_QUESTION_MAX_CHARS} characters or fewer.`
export const RSVP_ANSWER_TOO_LONG_MESSAGE = `Your answer must be ${RSVP_ANSWER_MAX_CHARS} characters or fewer.`
export const RSVP_ANSWER_REQUIRED_MESSAGE = RSVP_ANSWER_REQUIRED_HELP
export const RSVP_ANSWER_SAVE_FAILED_MESSAGE =
  'Your RSVP answer could not be saved. Please try again before continuing to payment.'

export const EVENT_RSVP_QUESTION_SELECT_FIELDS =
  'rsvp_question, rsvp_question_required' as const

export type EventRsvpQuestionConfig = {
  rsvp_question: string | null
  rsvp_question_required: boolean
}

export type EventRsvpQuestionInput = {
  question?: string | null
  required?: boolean | null
}

function isMissingColumnError(
  error: {
    message?: string
    code?: string
    details?: string
    hint?: string
  } | null
    | undefined,
  column: string
): boolean {
  if (!error) return false
  const haystack = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return (
    haystack.includes(column) &&
    (haystack.includes('does not exist') ||
      haystack.includes('schema cache') ||
      haystack.includes('could not find'))
  )
}

export function isMissingRsvpQuestionColumnError(
  error: {
    message?: string
    code?: string
    details?: string
    hint?: string
  } | null
    | undefined
): boolean {
  return (
    isMissingColumnError(error, 'rsvp_question') ||
    isMissingColumnError(error, 'rsvp_question_required')
  )
}

export function isMissingRsvpAnswerColumnError(
  error: {
    message?: string
    code?: string
    details?: string
    hint?: string
  } | null
    | undefined
): boolean {
  return isMissingColumnError(error, 'rsvp_answer')
}

export function isMissingPendingRsvpAnswerTableError(
  error: {
    message?: string
    code?: string
    details?: string
    hint?: string
  } | null
    | undefined
): boolean {
  if (!error) return false
  const haystack = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return (
    haystack.includes('event_rsvp_pending_answers') &&
    (haystack.includes('does not exist') ||
      haystack.includes('schema cache') ||
      haystack.includes('could not find'))
  )
}

export function withNullRsvpQuestion<T extends Record<string, unknown>>(
  row: T
): T & EventRsvpQuestionConfig {
  const question = (row as { rsvp_question?: unknown }).rsvp_question
  const required = (row as { rsvp_question_required?: unknown })
    .rsvp_question_required

  return {
    ...row,
    rsvp_question: typeof question === 'string' ? question : null,
    rsvp_question_required: required === true,
  }
}

export function isRsvpQuestionConfigured(
  question: string | null | undefined
): boolean {
  return Boolean(question && question.trim().length > 0)
}

export function normalizeEventRsvpQuestionConfig(
  input: EventRsvpQuestionInput
): EventRsvpQuestionConfig | { error: string } {
  const trimmed =
    typeof input.question === 'string' ? input.question.trim() : ''

  if (!trimmed) {
    return {
      rsvp_question: null,
      rsvp_question_required: false,
    }
  }

  if (trimmed.length > RSVP_QUESTION_MAX_CHARS) {
    return { error: RSVP_QUESTION_TOO_LONG_MESSAGE }
  }

  return {
    rsvp_question: trimmed,
    rsvp_question_required: Boolean(input.required),
  }
}

export function normalizeEventRsvpAnswer(
  answer: string | null | undefined
): { value: string | null } | { error: string } {
  const trimmed = typeof answer === 'string' ? answer.trim() : ''
  if (!trimmed) {
    return { value: null }
  }
  if (trimmed.length > RSVP_ANSWER_MAX_CHARS) {
    return { error: RSVP_ANSWER_TOO_LONG_MESSAGE }
  }
  return { value: trimmed }
}

export function goingRsvpAnswerRejection(input: {
  status: 'going' | 'maybe' | 'not_going'
  question?: string | null
  required?: boolean | null
  answer?: string | null
}): string | null {
  const parsedAnswer = normalizeEventRsvpAnswer(input.answer)
  if ('error' in parsedAnswer) {
    return parsedAnswer.error
  }

  if (input.status !== 'going') {
    return null
  }

  const config = normalizeEventRsvpQuestionConfig({
    question: input.question,
    required: input.required,
  })
  if ('error' in config) {
    return config.error
  }

  if (config.rsvp_question && config.rsvp_question_required && !parsedAnswer.value) {
    return RSVP_ANSWER_REQUIRED_MESSAGE
  }

  return null
}

export function rsvpAnswerWriteFields(input: {
  status: 'going' | 'maybe' | 'not_going'
  answer?: string | null
}): { rsvp_answer: string | null } | { error: string } | Record<string, never> {
  const parsedAnswer = normalizeEventRsvpAnswer(input.answer)
  if ('error' in parsedAnswer) {
    return parsedAnswer
  }

  if (input.status !== 'going') {
    return {}
  }

  return { rsvp_answer: parsedAnswer.value }
}

export type PaidCheckoutPendingAnswerPlan =
  | { action: 'skip' }
  | { action: 'upsert'; rsvp_answer: string }
  | { action: 'clear' }

export function paidCheckoutPendingAnswerPlan(
  answerWrite: { rsvp_answer: string | null } | { error: string } | Record<string, never>
): PaidCheckoutPendingAnswerPlan {
  if (!answerWrite || 'error' in answerWrite) {
    return { action: 'skip' }
  }
  if (!('rsvp_answer' in answerWrite)) {
    return { action: 'skip' }
  }
  if (typeof answerWrite.rsvp_answer === 'string' && answerWrite.rsvp_answer.length > 0) {
    return { action: 'upsert', rsvp_answer: answerWrite.rsvp_answer }
  }
  return { action: 'clear' }
}

export function goingPayloadWithPendingAnswer<T extends Record<string, unknown>>(
  payload: T,
  pendingAnswer: string | null | undefined
): T & { rsvp_answer?: string } {
  if (typeof pendingAnswer === 'string' && pendingAnswer.length > 0) {
    return { ...payload, rsvp_answer: pendingAnswer }
  }
  return payload
}

export function canViewerReadRsvpAnswer(input: {
  viewerUserId: string
  attendeeUserId: string
  isEventOwner: boolean
  isAdmin: boolean
}): boolean {
  if (input.viewerUserId === input.attendeeUserId) return true
  if (input.isEventOwner) return true
  return input.isAdmin
}

export function canViewerWriteRsvpAnswer(input: {
  viewerUserId: string
  attendeeUserId: string
}): boolean {
  return input.viewerUserId === input.attendeeUserId
}

/** Pending checkout answers are never host/admin visible. Own-row only. */
export function canViewerAccessPendingRsvpAnswer(input: {
  viewerUserId: string
  pendingUserId: string
}): boolean {
  return input.viewerUserId === input.pendingUserId
}

export function omitRsvpQuestionFields<T extends Record<string, unknown>>(
  payload: T
): Omit<T, 'rsvp_question' | 'rsvp_question_required'> {
  const rest = { ...payload }
  delete rest.rsvp_question
  delete rest.rsvp_question_required
  return rest
}

export function omitRsvpAnswerField<T extends Record<string, unknown>>(
  payload: T
): Omit<T, 'rsvp_answer'> {
  const rest = { ...payload }
  delete rest.rsvp_answer
  return rest
}
