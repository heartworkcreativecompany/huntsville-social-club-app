import { describe, expect, it } from 'vitest'
import {
  RSVP_ANSWER_MAX_CHARS,
  RSVP_ANSWER_REQUIRED_MESSAGE,
  RSVP_QUESTION_MAX_CHARS,
  RSVP_QUESTION_TOO_LONG_MESSAGE,
  canViewerAccessPendingRsvpAnswer,
  canViewerReadRsvpAnswer,
  canViewerWriteRsvpAnswer,
  goingRsvpAnswerRejection,
  isRsvpQuestionConfigured,
  normalizeEventRsvpAnswer,
  normalizeEventRsvpQuestionConfig,
  rsvpAnswerWriteFields,
  withNullRsvpQuestion,
} from '@/lib/event-rsvp-question'

describe('host RSVP question configuration', () => {
  it('saves an event without a question', () => {
    expect(
      normalizeEventRsvpQuestionConfig({ question: '', required: false })
    ).toEqual({ rsvp_question: null, rsvp_question_required: false })
  })

  it('saves an optional nonblank question', () => {
    expect(
      normalizeEventRsvpQuestionConfig({
        question: '  Any dietary notes?  ',
        required: false,
      })
    ).toEqual({
      rsvp_question: 'Any dietary notes?',
      rsvp_question_required: false,
    })
  })

  it('saves a required question only when question text is nonblank', () => {
    expect(
      normalizeEventRsvpQuestionConfig({
        question: 'Meal choice',
        required: true,
      })
    ).toEqual({
      rsvp_question: 'Meal choice',
      rsvp_question_required: true,
    })
    expect(
      normalizeEventRsvpQuestionConfig({
        question: '   ',
        required: true,
      })
    ).toEqual({
      rsvp_question: null,
      rsvp_question_required: false,
    })
    expect(
      normalizeEventRsvpQuestionConfig({
        question: '',
        required: true,
      })
    ).toEqual({
      rsvp_question: null,
      rsvp_question_required: false,
    })
  })

  it('treats whitespace-only host questions as absent', () => {
    expect(isRsvpQuestionConfigured('   \n\t  ')).toBe(false)
    expect(
      normalizeEventRsvpQuestionConfig({ question: '\n  \t', required: true })
    ).toEqual({ rsvp_question: null, rsvp_question_required: false })
  })

  it('rejects questions over the max length', () => {
    const tooLong = 'a'.repeat(RSVP_QUESTION_MAX_CHARS + 1)
    expect(normalizeEventRsvpQuestionConfig({ question: tooLong })).toEqual({
      error: RSVP_QUESTION_TOO_LONG_MESSAGE,
    })
    const atLimit = 'b'.repeat(RSVP_QUESTION_MAX_CHARS)
    expect(normalizeEventRsvpQuestionConfig({ question: atLimit })).toEqual({
      rsvp_question: atLimit,
      rsvp_question_required: false,
    })
  })
})

describe('Going RSVP answer rules', () => {
  it('preserves existing Going behavior when no question is configured', () => {
    expect(
      goingRsvpAnswerRejection({
        status: 'going',
        question: null,
        required: false,
        answer: '',
      })
    ).toBeNull()
    expect(
      goingRsvpAnswerRejection({
        status: 'going',
        question: '   ',
        required: true,
        answer: '',
      })
    ).toBeNull()
  })

  it('permits Going with no answer when the question is optional', () => {
    expect(
      goingRsvpAnswerRejection({
        status: 'going',
        question: 'Any allergies?',
        required: false,
        answer: '   ',
      })
    ).toBeNull()
    expect(
      rsvpAnswerWriteFields({ status: 'going', answer: '  ' })
    ).toEqual({ rsvp_answer: null })
  })

  it('blocks Going with a missing or whitespace answer when required', () => {
    expect(
      goingRsvpAnswerRejection({
        status: 'going',
        question: 'How will you arrive?',
        required: true,
        answer: '',
      })
    ).toBe(RSVP_ANSWER_REQUIRED_MESSAGE)
    expect(
      goingRsvpAnswerRejection({
        status: 'going',
        question: 'How will you arrive?',
        required: true,
        answer: '   \n',
      })
    ).toBe(RSVP_ANSWER_REQUIRED_MESSAGE)
  })

  it('accepts a trimmed nonblank answer for a required question', () => {
    expect(
      goingRsvpAnswerRejection({
        status: 'going',
        question: 'How will you arrive?',
        required: true,
        answer: '  Driving  ',
      })
    ).toBeNull()
    expect(
      rsvpAnswerWriteFields({ status: 'going', answer: '  Driving  ' })
    ).toEqual({ rsvp_answer: 'Driving' })
  })

  it('does not require an answer for Not going or cancel', () => {
    expect(
      goingRsvpAnswerRejection({
        status: 'not_going',
        question: 'How will you arrive?',
        required: true,
        answer: '',
      })
    ).toBeNull()
    expect(
      goingRsvpAnswerRejection({
        status: 'maybe',
        question: 'How will you arrive?',
        required: true,
        answer: '   ',
      })
    ).toBeNull()
    expect(
      rsvpAnswerWriteFields({ status: 'not_going', answer: '' })
    ).toEqual({})
  })

  it('keeps historical events and RSVPs without the new values working', () => {
    const historicalEvent = withNullRsvpQuestion({
      id: 'legacy-event',
      title: 'Mixer',
    })
    expect(historicalEvent.rsvp_question).toBeNull()
    expect(historicalEvent.rsvp_question_required).toBe(false)
    expect(
      goingRsvpAnswerRejection({
        status: 'going',
        question: historicalEvent.rsvp_question,
        required: historicalEvent.rsvp_question_required,
        answer: undefined,
      })
    ).toBeNull()
    expect(normalizeEventRsvpAnswer(undefined)).toEqual({ value: null })
  })
})

describe('RSVP answer authorization', () => {
  const member = 'member-1'
  const other = 'member-2'

  it('returns a saved answer only to that member in ordinary reads', () => {
    expect(
      canViewerReadRsvpAnswer({
        viewerUserId: member,
        attendeeUserId: member,
        isEventOwner: false,
        isAdmin: false,
      })
    ).toBe(true)
    expect(
      canViewerReadRsvpAnswer({
        viewerUserId: other,
        attendeeUserId: member,
        isEventOwner: false,
        isAdmin: false,
      })
    ).toBe(false)
  })

  it('does not let another member read or modify someone else’s answer', () => {
    expect(
      canViewerWriteRsvpAnswer({
        viewerUserId: other,
        attendeeUserId: member,
      })
    ).toBe(false)
    expect(
      canViewerReadRsvpAnswer({
        viewerUserId: other,
        attendeeUserId: member,
        isEventOwner: false,
        isAdmin: false,
      })
    ).toBe(false)
  })

  it('lets the event host or a Club admin read answers only for the applicable event role', () => {
    expect(
      canViewerReadRsvpAnswer({
        viewerUserId: 'host-1',
        attendeeUserId: member,
        isEventOwner: true,
        isAdmin: false,
      })
    ).toBe(true)
    expect(
      canViewerReadRsvpAnswer({
        viewerUserId: 'admin-1',
        attendeeUserId: member,
        isEventOwner: false,
        isAdmin: true,
      })
    ).toBe(true)
    expect(
      canViewerWriteRsvpAnswer({
        viewerUserId: 'host-1',
        attendeeUserId: member,
      })
    ).toBe(false)
  })

  it('keeps pending checkout answers own-row only, including from hosts and admins', () => {
    expect(
      canViewerAccessPendingRsvpAnswer({
        viewerUserId: member,
        pendingUserId: member,
      })
    ).toBe(true)
    expect(
      canViewerAccessPendingRsvpAnswer({
        viewerUserId: other,
        pendingUserId: member,
      })
    ).toBe(false)
    expect(
      canViewerAccessPendingRsvpAnswer({
        viewerUserId: 'host-1',
        pendingUserId: member,
      })
    ).toBe(false)
    expect(
      canViewerAccessPendingRsvpAnswer({
        viewerUserId: 'admin-1',
        pendingUserId: member,
      })
    ).toBe(false)
  })
})

describe('answer length', () => {
  it('rejects answers over the max length', () => {
    const tooLong = 'c'.repeat(RSVP_ANSWER_MAX_CHARS + 1)
    expect(normalizeEventRsvpAnswer(tooLong)).toEqual({
      error: `Your answer must be ${RSVP_ANSWER_MAX_CHARS} characters or fewer.`,
    })
    expect(
      goingRsvpAnswerRejection({
        status: 'going',
        question: 'Notes?',
        required: false,
        answer: tooLong,
      })
    ).toBe(`Your answer must be ${RSVP_ANSWER_MAX_CHARS} characters or fewer.`)
  })
})
