import { describe, expect, it } from 'vitest'
import {
  COMPATIBILITY_LIFESTYLE_ORDINAL_QUESTION_IDS,
  COMPATIBILITY_QUESTIONNAIRE_QUESTIONS,
  COMPATIBILITY_QUESTIONNAIRE_SECTIONS,
  COMPATIBILITY_QUESTIONNAIRE_VERSION,
} from '@/lib/compatibility/questionnaire-config'

describe('COMPATIBILITY_QUESTIONNAIRE_QUESTIONS', () => {
  it('defines the full planned questionnaire', () => {
    expect(COMPATIBILITY_QUESTIONNAIRE_VERSION).toBe(2)
    expect(COMPATIBILITY_QUESTIONNAIRE_QUESTIONS).toHaveLength(32)

    const prompts = COMPATIBILITY_QUESTIONNAIRE_QUESTIONS.map(
      (question) => question.prompt
    )

    expect(prompts).toContain('What is your gender?')
    expect(prompts).toContain(
      'Who are you interested in being matched with?'
    )
    expect(prompts).toContain(
      'What kind of relationship are you hoping to build?'
    )
    expect(prompts).toContain(
      'What relationship history feels most compatible to you?'
    )
    expect(prompts).toContain(
      'Staying active is an important part of who I am.'
    )
    expect(prompts).toContain(
      'Enjoying the company of animals is important to me.'
    )
  })

  it('uses five distinct options for each ordinal question', () => {
    const ordinalQuestions = COMPATIBILITY_QUESTIONNAIRE_QUESTIONS.filter(
      (question) =>
        (question.type === 'single' || question.type === 'scale') &&
        question.id !== 'gender'
    )

    for (const question of ordinalQuestions) {
      expect(question.options).toHaveLength(5)
    }
  })

  it('places Lifestyle after existing sections with agree/disagree sliders', () => {
    expect(COMPATIBILITY_QUESTIONNAIRE_SECTIONS.map((section) => section.id)).toEqual(
      ['eligibility', 'values', 'family', 'lifestyle']
    )
    expect(
      COMPATIBILITY_QUESTIONNAIRE_SECTIONS.find(
        (section) => section.id === 'lifestyle'
      )?.title
    ).toBe('Lifestyle')
    expect(COMPATIBILITY_LIFESTYLE_ORDINAL_QUESTION_IDS).toHaveLength(15)

    const lifestyleQuestions = COMPATIBILITY_QUESTIONNAIRE_QUESTIONS.filter(
      (question) => question.section === 'lifestyle'
    )
    expect(lifestyleQuestions).toHaveLength(15)
    expect(lifestyleQuestions.every((question) => question.type === 'scale')).toBe(
      true
    )
  })
})
