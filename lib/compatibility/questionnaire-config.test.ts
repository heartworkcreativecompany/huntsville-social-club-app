import { describe, expect, it } from 'vitest'
import {
  COMPATIBILITY_QUESTIONNAIRE_QUESTIONS,
  COMPATIBILITY_QUESTIONNAIRE_VERSION,
} from '@/lib/compatibility/questionnaire-config'

describe('COMPATIBILITY_QUESTIONNAIRE_QUESTIONS', () => {
  it('defines the full planned questionnaire', () => {
    expect(COMPATIBILITY_QUESTIONNAIRE_VERSION).toBe(2)
    expect(COMPATIBILITY_QUESTIONNAIRE_QUESTIONS).toHaveLength(17)

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
  })

  it('uses five distinct options for each ordinal question', () => {
    const ordinalQuestions = COMPATIBILITY_QUESTIONNAIRE_QUESTIONS.filter(
      (question) => question.type === 'single' && question.id !== 'gender'
    )

    for (const question of ordinalQuestions) {
      expect(question.options).toHaveLength(5)
    }
  })
})
