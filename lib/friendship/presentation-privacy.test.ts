import { describe, expect, it } from 'vitest'
import { deriveFriendshipMatchReasons, reasonsAreMemberSafe } from '@/lib/friendship/match-explanation'
import { completeFriendshipQuestionnaire } from '@/lib/friendship/test-fixtures'
import { friendshipFitLabel } from '@/lib/friendship/labels'
import { scoreFriendshipPair } from '@/lib/friendship/scoring'
import {
  directorySelectExcludesFriendshipAnswers,
  publicMatchLeaksSensitiveData,
  toPublicFriendshipMatch,
} from '@/lib/friendship/privacy'
import { COMPATIBILITY_QUESTIONNAIRE_QUESTIONS } from '@/lib/compatibility/questionnaire-config'
import { FRIENDSHIP_MUTATION_DENIED_UNPAID } from '@/lib/friendship/eligibility'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('friendship match presentation', () => {
  it('renders only the three member-facing fit labels and hides low scores', () => {
    expect(friendshipFitLabel(92)).toBe('Strong friendship fit')
    expect(friendshipFitLabel(70)).toBe('Promising connection')
    expect(friendshipFitLabel(52)).toBe('Shared interests to explore')
    expect(friendshipFitLabel(40)).toBeNull()
  })

  it('does not include a raw score on the public match DTO', () => {
    const match = toPublicFriendshipMatch({
      id: 'rec-1',
      recommendedUserId: 'user-2',
      displayName: 'Alex',
      locationArea: 'Downtown',
      primaryPhoto: null,
      fitLabel: 'Strong friendship fit',
      matchReasons: ['You both prefer low-key, one-on-one hangouts.'],
      createdAt: '2026-08-01T00:00:00.000Z',
      compatibilityScore: 91,
      scoreBreakdown: { score: 91 },
      answers: { alcoholFrequency: 'often' },
      priorities: ['shared_interests'],
    })
    expect(publicMatchLeaksSensitiveData(match)).toBe(false)
    expect(JSON.stringify(match)).not.toContain('91')
    expect(JSON.stringify(match)).not.toContain('alcohol')
    expect(JSON.stringify(match)).not.toContain('shared_interests')
  })

  it('returns evidence-based reasons for a representative compatible pair', () => {
    const left = completeFriendshipQuestionnaire()
    const right = completeFriendshipQuestionnaire()
    const reasons = deriveFriendshipMatchReasons(left, right)
    expect(reasons.length).toBeGreaterThan(0)
    expect(reasons.length).toBeLessThanOrEqual(4)
    expect(reasons).toContain('You both prefer low-key, one-on-one hangouts.')
    expect(reasons).toContain('You both want friendships that can grow deeper over time.')
    expect(reasonsAreMemberSafe(reasons)).toBe(true)
  })

  it('does not fabricate reasons when answers are not compatible', () => {
    const left = completeFriendshipQuestionnaire({
      preferOneOnOne: 5,
      enjoyLowKeyHangouts: 5,
      longTermMeaningful: 5,
      preferDirectCommunication: 5,
      followThroughOnPlans: 5,
    })
    const right = completeFriendshipQuestionnaire({
      preferOneOnOne: 1,
      enjoyLowKeyHangouts: 1,
      longTermMeaningful: 1,
      preferDirectCommunication: 1,
      followThroughOnPlans: 1,
      idealHangouts: ['fitness_sports', 'game_night', 'coworking'],
      stayInTouchByText: 1,
      valueKindnessInclusivity: 1,
      supportLocalCommunity: 1,
      enjoyPlayfulBanter: 1,
      enjoyHosting: 1,
      stayActiveOutside: 1,
      wantEmotionalSupport: 1,
      likeMeetingNewPeople: 1,
      givingBackMatters: 1,
      personalGrowthMatters: 1,
      familyTimeImportant: 1,
      comfortableInitiating: 1,
      wideCircleAndDeep: 1,
      friendshipGoals: ['professional'],
      desiredTimeTogether: 'multiple_week',
    })
    const reasons = deriveFriendshipMatchReasons(left, right)
    expect(reasons).not.toContain('You both prefer low-key, one-on-one hangouts.')
    expect(reasons).not.toContain('You both want friendships that can grow deeper over time.')
  })

  it('omits sensitive alcohol and private priority reasons', () => {
    const reasons = deriveFriendshipMatchReasons(
      completeFriendshipQuestionnaire({ alcoholFrequency: 'often' }),
      completeFriendshipQuestionnaire({ alcoholFrequency: 'never' })
    )
    expect(reasonsAreMemberSafe(reasons)).toBe(true)
    expect(reasons.join(' ')).not.toMatch(/alcohol|priority|percent|%/i)
  })

  it('stores reasons on the internal score breakdown without exposing them as answer values', () => {
    const result = scoreFriendshipPair(
      completeFriendshipQuestionnaire(),
      completeFriendshipQuestionnaire()
    )
    expect(Array.isArray(result.reasons)).toBe(true)
    expect(result.reasons.length).toBeGreaterThan(0)
    expect(result.reasons.join(' ')).not.toMatch(/\b[1-5]\b/)
  })
})

describe('friendship privacy conventions', () => {
  it('keeps friendship answers out of directory profile selects', () => {
    expect(directorySelectExcludesFriendshipAnswers()).toBe(true)
  })

  it('uses own-row RLS on the private friendship questionnaire table', () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260823000000_friendship_compatibility.sql'
      ),
      'utf8'
    )
    expect(sql).toContain('enable row level security')
    expect(sql).toContain('Members read own friendship questionnaire')
    expect(sql).toContain('user_id = (select auth.uid())')
    expect(sql).toContain('Members read own friendship match recommendations')
    expect(sql).toContain('create table if not exists public.friendship_questionnaires')
    expect(sql).not.toMatch(/alter table public\.profiles[\s\S]*friendship_questionnaire/)
  })

  it('does not change Dating questionnaire prompts', () => {
    expect(COMPATIBILITY_QUESTIONNAIRE_QUESTIONS).toHaveLength(32)
    expect(
      COMPATIBILITY_QUESTIONNAIRE_QUESTIONS.some(
        (question) => question.id === 'friendshipGoals'
      )
    ).toBe(false)
  })

  it('keeps unpaid mutation denial copy from leaking other members’ data', () => {
    expect(FRIENDSHIP_MUTATION_DENIED_UNPAID).not.toMatch(/subscription|inner circle|elite/i)
  })
})
