import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import CompatibilityQuestionnaireForm from '@/app/(club)/compatibility/compatibility-questionnaire-form'
import { deriveMatchExplanations } from '@/lib/compatibility/match-explanation'
import {
  buildCompatibilityQuestionnaire,
  isQuestionnaireComplete,
  questionnaireAnswersFromStored,
  validateQuestionnaireAnswersForSave,
} from '@/lib/compatibility/questionnaire'
import type { CompatibilityQuestionnaireAnswers } from '@/lib/compatibility/questionnaire'
import {
  ALIGNMENT_IMPORTANCE_QUESTION_IDS,
  COMPATIBILITY_QUESTIONNAIRE_V2_VERSION,
  COMPATIBILITY_QUESTIONNAIRE_VERSION,
  RELATIONSHIP_ALIGNMENT_IMPORTANCE_OPTIONS,
  RETIRED_FAITH_VALUES_QUESTION_ID,
  questionsForSection,
} from '@/lib/compatibility/questionnaire-config'
import {
  alignmentImportancePoints,
  scoreCompatibilityPair,
} from '@/lib/compatibility/scoring'
import { completeFriendshipQuestionnaire } from '@/lib/friendship/test-fixtures'
import {
  FRIENDSHIP_PRIORITY_OPTIONS,
  FRIENDSHIP_PROMPT_QUESTIONS,
} from '@/lib/friendship/questionnaire-config'
import {
  FRIENDSHIP_BASE_DIMENSION_WEIGHTS,
  scoreFriendshipPair,
} from '@/lib/friendship/scoring'
import type { CompatibilityOrdinalAnswer } from '@/lib/compatibility/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: () => undefined,
    refresh: () => undefined,
  }),
}))

vi.mock('@/app/(club)/compatibility/actions', () => ({
  saveCompatibilityQuestionnaire: async () => ({ success: true }),
}))

const ALIGNMENT_PROMPTS = [
  'How important is sharing the same faith or spiritual beliefs in a romantic relationship?',
  'How important is alignment on core values (family, lifestyle, communication, finances, priorities) in a relationship?',
  'How important is having a similar worldview or outlook on life in a romantic relationship?',
] as const

const ALIGNMENT_LABELS = [
  'Not important to me',
  'Somewhat important',
  'Important',
  'Very important',
  'Essential for a long-term relationship',
] as const

const BELIEF_INFERENCE =
  /christian|muslim|jewish|hindu|buddhist|atheist|religious affiliation|politic|democrat|republican/i

const completeAnswers: CompatibilityQuestionnaireAnswers = {
  gender: 'woman',
  genderSelfDescribe: '',
  age: 32,
  preferredMatchAgeMin: 25,
  preferredMatchAgeMax: 45,
  matchInterests: ['men'],
  relationshipIntention: 2,
  faithValues: null,
  shared_faith_importance: 5,
  core_values_alignment_importance: 4,
  shared_worldview_importance: 3,
  valuesVsChemistry: 2,
  partnershipDailyLife: 3,
  socialRhythm: 3,
  saturdayStyle: 3,
  planningSpontaneity: 3,
  ambition: 3,
  maritalHistory: 1,
  familySituation: ['no_children'],
  openToPartnerWithChildren: 4,
  futureChildren: 2,
  openToDivorced: 4,
  partnerHistoryPreference: 3,
  stayingActiveImportant: 3,
  enjoyDancingSocially: 3,
  enjoyEdgyHumor: 3,
  preferLowKeyHangouts: 3,
  needStructureOrganization: 3,
  spontaneousPlanReady: 3,
  preferOneOnOne: 3,
  sharedValuesOverHobbies: 3,
  likePlayfulBanter: 3,
  loveLanguagesImportant: 3,
  extendedFamilyTimeImportant: 3,
  enjoyHostingGatherings: 3,
  drinkAlcoholRegularly: 3,
  smokeRegularly: 3,
  animalCompanyImportant: 3,
}

const historicalQuestionnaire = {
  version: COMPATIBILITY_QUESTIONNAIRE_V2_VERSION,
  gender: 'woman' as const,
  genderSelfDescribe: null,
  age: 32,
  preferredMatchAgeMin: 25,
  preferredMatchAgeMax: 45,
  matchInterests: ['men' as const],
  relationshipIntention: 2 as const,
  faithValues: 4 as const,
  valuesVsChemistry: 2 as const,
  partnershipDailyLife: 3 as const,
  socialRhythm: 3 as const,
  saturdayStyle: 3 as const,
  planningSpontaneity: 3 as const,
  ambition: 3 as const,
  maritalHistory: 1 as const,
  familySituation: ['no_children' as const],
  openToPartnerWithChildren: 4 as const,
  futureChildren: 2 as const,
  openToDivorced: 4 as const,
  partnerHistoryPreference: 3 as const,
  stayingActiveImportant: 3 as const,
  enjoyDancingSocially: 3 as const,
  enjoyEdgyHumor: 3 as const,
  preferLowKeyHangouts: 3 as const,
  needStructureOrganization: 3 as const,
  spontaneousPlanReady: 3 as const,
  preferOneOnOne: 3 as const,
  sharedValuesOverHobbies: 3 as const,
  likePlayfulBanter: 3 as const,
  loveLanguagesImportant: 3 as const,
  extendedFamilyTimeImportant: 3 as const,
  enjoyHostingGatherings: 3 as const,
  drinkAlcoholRegularly: 3 as const,
  smokeRegularly: 3 as const,
  animalCompanyImportant: 3 as const,
}

function profile(
  questionnaire: Record<string, unknown>,
  gender: 'woman' | 'man' = 'woman'
) {
  return {
    compatibility_questionnaire: {
      ...questionnaire,
      gender,
      matchInterests: gender === 'woman' ? ['men'] : ['women'],
    },
    discovery_interests: ['Hiking'],
    location_area: 'Downtown Huntsville',
    birth_year: 1990,
  }
}

function currentQuestionnaire(
  alignment: [
    CompatibilityOrdinalAnswer,
    CompatibilityOrdinalAnswer,
    CompatibilityOrdinalAnswer,
  ]
) {
  return buildCompatibilityQuestionnaire({
    ...completeAnswers,
    shared_faith_importance: alignment[0],
    core_values_alignment_importance: alignment[1],
    shared_worldview_importance: alignment[2],
  })
}

describe('dating alignment importance questions', () => {
  it('hides the retired combined question from new respondents', () => {
    const visibleValues = questionsForSection('values')
    expect(visibleValues.map((question) => question.id)).not.toContain(
      RETIRED_FAITH_VALUES_QUESTION_ID
    )
    expect(visibleValues.map((question) => question.prompt)).not.toContain(
      'How central is shared faith, values, or worldview in a relationship for you?'
    )
  })

  it('shows the three approved questions in order with the shared five-point scale', () => {
    const visibleIds = questionsForSection('values').map((question) => question.id)
    const faithIndex = visibleIds.indexOf('shared_faith_importance')
    expect(visibleIds.slice(faithIndex, faithIndex + 3)).toEqual([
      ...ALIGNMENT_IMPORTANCE_QUESTION_IDS,
    ])

    const visiblePrompts = questionsForSection('values').map(
      (question) => question.prompt
    )
    expect(visiblePrompts.slice(faithIndex, faithIndex + 3)).toEqual([
      ...ALIGNMENT_PROMPTS,
    ])

    for (const questionId of ALIGNMENT_IMPORTANCE_QUESTION_IDS) {
      const question = questionsForSection('values').find(
        (item) => item.id === questionId
      )
      expect(question?.required).toBe(true)
      expect(question?.type).toBe('single')
      expect(question?.options).toEqual(
        ALIGNMENT_LABELS.map((label, index) => ({
          value: index + 1,
          label,
        }))
      )
    }

    expect(RELATIONSHIP_ALIGNMENT_IMPORTANCE_OPTIONS.map((option) => option.value)).toEqual(
      [1, 2, 3, 4, 5]
    )
    expect(COMPATIBILITY_QUESTIONNAIRE_VERSION).toBe(3)
  })

  it('requires integer answers from 1 to 5 before a completed save', () => {
    const missing = validateQuestionnaireAnswersForSave(
      {
        ...completeAnswers,
        shared_faith_importance: null,
        core_values_alignment_importance: null,
        shared_worldview_importance: null,
      },
      true
    )
    expect(missing).toEqual({
      error: expect.stringContaining(ALIGNMENT_PROMPTS[0]),
    })
    if ('error' in missing) {
      expect(missing.error).toContain(ALIGNMENT_PROMPTS[1])
      expect(missing.error).toContain(ALIGNMENT_PROMPTS[2])
    }

    for (const invalid of [0, 6, 1.5, Number.NaN]) {
      const result = validateQuestionnaireAnswersForSave(
        {
          ...completeAnswers,
          shared_faith_importance: invalid,
        },
        true
      )
      expect(result).toEqual({
        error: 'Choose one of the five answers for each alignment question.',
      })
    }
  })

  it('renders the three questions as separate radio groups without prefilling a historical answer', () => {
    const html = renderToStaticMarkup(
      createElement(CompatibilityQuestionnaireForm, {
        initialAnswers: questionnaireAnswersFromStored(historicalQuestionnaire),
        completed: true,
      })
    )

    expect(html).not.toContain(
      'How central is shared faith, values, or worldview in a relationship for you?'
    )
    for (const prompt of ALIGNMENT_PROMPTS) {
      expect(html).toContain(`aria-label="${prompt}"`)
      expect(html).toContain(prompt)
    }
    for (const questionId of ALIGNMENT_IMPORTANCE_QUESTION_IDS) {
      const inputs = [
        ...html.matchAll(
          new RegExp(`name="${questionId}"[^>]*>`, 'g')
        ),
      ]
      expect(inputs).toHaveLength(5)
      expect(inputs.map((match) => match[0])).toEqual([
        expect.stringContaining('value="1"'),
        expect.stringContaining('value="2"'),
        expect.stringContaining('value="3"'),
        expect.stringContaining('value="4"'),
        expect.stringContaining('value="5"'),
      ])
      expect(inputs.every((match) => !match[0].includes('checked'))).toBe(true)
    }
    for (const prompt of ALIGNMENT_PROMPTS) {
      const start = html.indexOf(`aria-label="${prompt}"`)
      const group = html.slice(start, html.indexOf('</div>', start))
      for (const label of ALIGNMENT_LABELS) {
        expect(group.split(label).length - 1).toBe(1)
      }
    }
  })

  it('reads a historical combined answer without copying it into the new questions', () => {
    const snapshot = structuredClone(historicalQuestionnaire)
    const answers = questionnaireAnswersFromStored(snapshot)

    expect(isQuestionnaireComplete(snapshot)).toBe(true)
    expect(snapshot).toEqual(historicalQuestionnaire)
    expect(answers.faithValues).toBe(4)
    expect(answers.shared_faith_importance).toBeNull()
    expect(answers.core_values_alignment_importance).toBeNull()
    expect(answers.shared_worldview_importance).toBeNull()
    expect(answers.relationshipIntention).toBe(2)
    expect(answers.familySituation).toEqual(['no_children'])
  })

  it('keeps unrelated answers and the retired answer when the new questions are saved', () => {
    const existing = structuredClone(historicalQuestionnaire)
    const saved = buildCompatibilityQuestionnaire(
      {
        ...questionnaireAnswersFromStored(existing),
        shared_faith_importance: 5,
        core_values_alignment_importance: 3,
        shared_worldview_importance: 1,
      },
      existing
    )

    expect(existing).toEqual(historicalQuestionnaire)
    expect(saved.version).toBe(COMPATIBILITY_QUESTIONNAIRE_VERSION)
    expect(saved.faithValues).toBe(4)
    expect(saved.shared_faith_importance).toBe(5)
    expect(saved.core_values_alignment_importance).toBe(3)
    expect(saved.shared_worldview_importance).toBe(1)
    expect(saved.relationshipIntention).toBe(2)
    expect(saved.valuesVsChemistry).toBe(2)
    expect(saved.familySituation).toEqual(['no_children'])
    expect(saved.animalCompanyImportant).toBe(3)
    expect(isQuestionnaireComplete(saved)).toBe(true)
  })
})

describe('dating alignment importance scoring', () => {
  it('treats 5 as a strong requirement without excluding the pair', () => {
    const aligned = scoreCompatibilityPair(
      profile(currentQuestionnaire([5, 5, 5])),
      profile(currentQuestionnaire([5, 5, 5]), 'man')
    )
    const mismatched = scoreCompatibilityPair(
      profile(currentQuestionnaire([5, 5, 5])),
      profile(currentQuestionnaire([1, 5, 5]), 'man')
    )

    expect(alignmentImportancePoints(5, 5)).toBe(12)
    expect(alignmentImportancePoints(5, 4)).toBe(10)
    expect(alignmentImportancePoints(5, 1)).toBe(1)
    expect(aligned.score).toBe(100)
    expect(mismatched.score).toBe(82)
    expect(aligned.score).toBeGreaterThan(mismatched.score)
    expect(mismatched.score).toBeGreaterThanOrEqual(70)
    expect(mismatched.breakdown.hard_filter_failed).toBeUndefined()
    expect(mismatched.breakdown.shared_faith_importance).toBe(1)
    expect(mismatched.breakdown.alignment_caution).toBe(
      'Large difference in how important shared faith is'
    )
    expect(aligned.breakdown.faithValues).toBeUndefined()
  })

  it('weights 3 and 4 more than 1 and 2 and does not infer beliefs', () => {
    expect(alignmentImportancePoints(4, 4)).toBe(8)
    expect(alignmentImportancePoints(3, 3)).toBe(8)
    expect(alignmentImportancePoints(2, 2)).toBe(3)
    expect(alignmentImportancePoints(1, 1)).toBe(3)
    expect(alignmentImportancePoints(4, 1)).toBe(1)

    const meaningful = scoreCompatibilityPair(
      profile(currentQuestionnaire([4, 3, 4])),
      profile(currentQuestionnaire([4, 3, 4]), 'man')
    )
    const low = scoreCompatibilityPair(
      profile(currentQuestionnaire([1, 2, 1])),
      profile(currentQuestionnaire([1, 2, 1]), 'man')
    )
    const cautioned = scoreCompatibilityPair(
      profile(currentQuestionnaire([4, 3, 4])),
      profile(currentQuestionnaire([1, 3, 4]), 'man')
    )

    expect(meaningful.breakdown.shared_faith_importance).toBe(8)
    expect(low.breakdown.shared_faith_importance).toBe(3)
    expect(meaningful.score).toBe(100)
    expect(low.score).toBe(100)
    expect(cautioned.score).toBe(90)
    expect(cautioned.breakdown.alignment_caution).toContain(
      'how important shared faith is'
    )
    expect(cautioned.score).toBeGreaterThanOrEqual(70)
    expect(cautioned.breakdown.hard_filter_failed).toBeUndefined()

    const explanations = deriveMatchExplanations({
      scoreBreakdown: cautioned.breakdown,
    })
    const rendered = JSON.stringify({
      breakdown: cautioned.breakdown,
      explanations,
    })
    expect(rendered).not.toMatch(BELIEF_INFERENCE)
    expect(explanations.join(' ')).not.toContain('Large difference')
  })

  it('keeps historical combined-answer scoring when the new answers are absent', () => {
    const viewer = profile(historicalQuestionnaire)
    const candidate = profile(
      { ...historicalQuestionnaire, faithValues: 4 },
      'man'
    )
    const result = scoreCompatibilityPair(viewer, candidate)

    expect(result.score).toBeGreaterThanOrEqual(70)
    expect(result.breakdown.faithValues).toBe(10)
    expect(result.breakdown.shared_faith_importance).toBeUndefined()
    expect(result.breakdown.core_values_alignment_importance).toBeUndefined()
    expect(result.breakdown.shared_worldview_importance).toBeUndefined()
    expect(result.breakdown.hard_filter_failed).toBeUndefined()
  })

  it('does not compare a new answer set with a historical combined answer', () => {
    const result = scoreCompatibilityPair(
      profile(currentQuestionnaire([5, 5, 5])),
      profile(historicalQuestionnaire, 'man')
    )

    expect(result.score).toBeGreaterThan(0)
    expect(result.breakdown.alignment_unscored).toBe(1)
    expect(result.breakdown.faithValues).toBeUndefined()
    expect(result.breakdown.shared_faith_importance).toBeUndefined()
    expect(result.breakdown.hard_filter_failed).toBeUndefined()
  })

  it('does not change friendship or professional matching', () => {
    const friendship = completeFriendshipQuestionnaire()
    const scored = scoreFriendshipPair(friendship, friendship)

    expect(scored.score).toBe(100)
    expect(scored.breakdown.version).toBe('friendship_v1')
    expect(FRIENDSHIP_BASE_DIMENSION_WEIGHTS).toEqual({
      goals: 0.25,
      social: 0.2,
      lifestyle: 0.2,
      communication: 0.2,
      values: 0.15,
    })
    expect(
      FRIENDSHIP_PROMPT_QUESTIONS.some((question) =>
        (ALIGNMENT_IMPORTANCE_QUESTION_IDS as readonly string[]).includes(
          question.id
        )
      )
    ).toBe(false)
    expect(
      FRIENDSHIP_PRIORITY_OPTIONS.some(
        (option) => option.value === 'professional_networking'
      )
    ).toBe(true)
  })
})
