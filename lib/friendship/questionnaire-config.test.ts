import { describe, expect, it } from 'vitest'
import {
  FRIENDSHIP_LIKE_ME_SCALE,
  FRIENDSHIP_PROMPT_QUESTIONS,
  FRIENDSHIP_QUESTIONNAIRE_QUESTIONS,
  FRIENDSHIP_QUESTIONNAIRE_SECTIONS,
  FRIENDSHIP_QUESTIONNAIRE_VERSION,
} from '@/lib/friendship/questionnaire-config'

describe('FRIENDSHIP_QUESTIONNAIRE_QUESTIONS', () => {
  it('defines 34 prompts plus private priority weights', () => {
    expect(FRIENDSHIP_QUESTIONNAIRE_VERSION).toBe(1)
    expect(FRIENDSHIP_PROMPT_QUESTIONS).toHaveLength(34)
    expect(FRIENDSHIP_QUESTIONNAIRE_QUESTIONS).toHaveLength(35)
    expect(
      FRIENDSHIP_QUESTIONNAIRE_QUESTIONS.some(
        (question) => question.id === 'friendshipPriorities'
      )
    ).toBe(true)
  })

  it('uses the specified 1–5 like-me scale', () => {
    expect(FRIENDSHIP_LIKE_ME_SCALE.map((option) => option.label)).toEqual([
      '1 Not like me',
      '2 Slightly like me',
      '3 Sometimes / neutral',
      '4 Mostly like me',
      '5 Very much like me',
    ])

    const scaleQuestions = FRIENDSHIP_QUESTIONNAIRE_QUESTIONS.filter(
      (question) => question.type === 'scale'
    )
    expect(scaleQuestions.length).toBeGreaterThan(20)
    for (const question of scaleQuestions) {
      expect(question.options?.map((option) => option.label)).toEqual(
        FRIENDSHIP_LIKE_ME_SCALE.map((option) => option.label)
      )
    }
  })

  it('groups prompts into accessible sections including priorities', () => {
    expect(FRIENDSHIP_QUESTIONNAIRE_SECTIONS.map((section) => section.id)).toEqual([
      'goals',
      'social',
      'lifestyle',
      'communication',
      'values',
      'priorities',
    ])
  })

  it('adds prefer-not-to-answer only on alcohol questions and excludes them from scoring', () => {
    const alcohol = FRIENDSHIP_QUESTIONNAIRE_QUESTIONS.filter(
      (question) => question.sensitive
    )
    expect(alcohol.map((question) => question.id)).toEqual([
      'alcoholFrequency',
      'alcoholComfort',
    ])
    for (const question of alcohol) {
      expect(question.scoring).toBe('exclude')
      expect(
        question.options?.some((option) => option.value === 'prefer_not_to_answer')
      ).toBe(true)
    }
  })

  it('limits hangouts and priorities to 3 selections', () => {
    expect(
      FRIENDSHIP_QUESTIONNAIRE_QUESTIONS.find((question) => question.id === 'idealHangouts')
        ?.maxSelections
    ).toBe(3)
    expect(
      FRIENDSHIP_QUESTIONNAIRE_QUESTIONS.find(
        (question) => question.id === 'friendshipPriorities'
      )?.maxSelections
    ).toBe(3)
  })
})
