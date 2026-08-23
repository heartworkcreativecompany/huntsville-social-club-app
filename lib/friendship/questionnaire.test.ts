import { describe, expect, it } from 'vitest'
import {
  buildFriendshipQuestionnaire,
  friendshipAnswersFromStored,
  isFriendshipQuestionnaireComplete,
  isFriendshipQuestionnaireSubmitted,
  normalizeFriendshipGoals,
  resolveFriendshipQuestionnaireState,
  validateFriendshipAnswersForSave,
} from '@/lib/friendship/questionnaire'
import { completeFriendshipAnswers } from '@/lib/friendship/test-fixtures'

describe('friendship questionnaire save and validation', () => {
  it('allows draft saves with partial answers', () => {
    const result = validateFriendshipAnswersForSave(
      completeFriendshipAnswers({
        longTermMeaningful: null,
        friendshipPriorities: [],
      }),
      false
    )
    expect('questionnaire' in result).toBe(true)
    if ('questionnaire' in result) {
      expect(isFriendshipQuestionnaireComplete(result.questionnaire)).toBe(false)
    }
  })

  it('rejects complete submit until every required prompt is answered', () => {
    const result = validateFriendshipAnswersForSave(
      completeFriendshipAnswers({ desiredTimeTogether: '' }),
      true
    )
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toMatch(/Desired time with new friends/)
    }
  })

  it('accepts a complete questionnaire including prefer-not-to-answer alcohol items', () => {
    const result = validateFriendshipAnswersForSave(
      completeFriendshipAnswers(),
      true
    )
    expect('questionnaire' in result).toBe(true)
    if ('questionnaire' in result) {
      expect(isFriendshipQuestionnaireComplete(result.questionnaire)).toBe(true)
      expect(result.questionnaire.alcoholFrequency).toBe('prefer_not_to_answer')
    }
  })

  it('treats mix-all friendship goals as exclusive', () => {
    expect(
      normalizeFriendshipGoals(['one_on_one', 'mix_all', 'friend_group'])
    ).toEqual(['mix_all'])
  })

  it('caps hangouts and private priorities at 3', () => {
    const stored = buildFriendshipQuestionnaire(
      completeFriendshipAnswers({
        idealHangouts: [
          'coffee_brunch',
          'dinner_conversation',
          'hiking_outdoor',
          'game_night',
        ],
        friendshipPriorities: [
          'shared_interests',
          'similar_lifestyle',
          'emotional_support',
          'humor_personality',
        ],
      })
    )
    expect(stored.idealHangouts).toHaveLength(3)
    expect(stored.friendshipPriorities).toHaveLength(3)
  })

  it('keeps submitted state after later edits that remain complete', () => {
    const complete = buildFriendshipQuestionnaire(completeFriendshipAnswers())
    expect(
      isFriendshipQuestionnaireSubmitted({
        answers: complete,
        status: 'submitted',
        completed_at: '2026-08-01T00:00:00.000Z',
      })
    ).toBe(true)

    const updated = buildFriendshipQuestionnaire(
      completeFriendshipAnswers({ preferOneOnOne: 2 })
    )
    expect(isFriendshipQuestionnaireComplete(updated)).toBe(true)
  })

  it('classifies empty, in-progress, and complete states', () => {
    expect(resolveFriendshipQuestionnaireState(null)).toBe('empty')
    expect(
      resolveFriendshipQuestionnaireState({
        answers: buildFriendshipQuestionnaire(
          completeFriendshipAnswers({ longTermMeaningful: null })
        ),
        status: 'draft',
        completed_at: null,
      })
    ).toBe('in_progress')
    expect(
      resolveFriendshipQuestionnaireState({
        answers: buildFriendshipQuestionnaire(completeFriendshipAnswers()),
        status: 'submitted',
        completed_at: '2026-08-01T00:00:00.000Z',
      })
    ).toBe('complete')
  })

  it('round-trips stored answers without exposing extra fields', () => {
    const stored = buildFriendshipQuestionnaire(completeFriendshipAnswers())
    const parsed = friendshipAnswersFromStored(stored)
    expect(parsed.friendshipGoals).toEqual(['one_on_one', 'activity_hobby'])
    expect(parsed.friendshipPriorities).toHaveLength(3)
  })
})
