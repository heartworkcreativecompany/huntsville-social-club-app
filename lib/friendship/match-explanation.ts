import { FRIENDSHIP_HANGOUT_OPTIONS } from '@/lib/friendship/questionnaire-config'
import type { FriendshipQuestionnaireComplete } from '@/lib/friendship/types'

const HIGH_AGREE = 4

function bothHigh(
  left: number,
  right: number,
  threshold = HIGH_AGREE
): boolean {
  return left >= threshold && right >= threshold
}

function hangoutOverlap(
  left: string[],
  right: string[]
): string[] {
  const shared = left.filter((item) => right.includes(item))
  return [...new Set(shared)]
}

type ReasonRule = {
  id: string
  reason: string
  strength: (viewer: FriendshipQuestionnaireComplete, candidate: FriendshipQuestionnaireComplete) => number
  qualifies: (
    viewer: FriendshipQuestionnaireComplete,
    candidate: FriendshipQuestionnaireComplete
  ) => boolean
}

const HANGOUT_REASON_BY_VALUE: Record<string, string> = Object.fromEntries(
  FRIENDSHIP_HANGOUT_OPTIONS.map((option) => [
    option.value,
    `You both enjoy ${String(option.label).charAt(0).toLowerCase()}${String(option.label).slice(1)}.`,
  ])
)

const BASE_RULES: ReasonRule[] = [
  {
    id: 'low_key_one_on_one',
    reason: 'You both prefer low-key, one-on-one hangouts.',
    qualifies: (viewer, candidate) =>
      bothHigh(viewer.preferOneOnOne, candidate.preferOneOnOne) &&
      bothHigh(viewer.enjoyLowKeyHangouts, candidate.enjoyLowKeyHangouts),
    strength: (viewer, candidate) =>
      (viewer.preferOneOnOne +
        candidate.preferOneOnOne +
        viewer.enjoyLowKeyHangouts +
        candidate.enjoyLowKeyHangouts) /
      4,
  },
  {
    id: 'one_on_one',
    reason: 'You both prefer one-on-one hangouts.',
    qualifies: (viewer, candidate) =>
      bothHigh(viewer.preferOneOnOne, candidate.preferOneOnOne) &&
      !(
        bothHigh(viewer.enjoyLowKeyHangouts, candidate.enjoyLowKeyHangouts)
      ),
    strength: (viewer, candidate) =>
      (viewer.preferOneOnOne + candidate.preferOneOnOne) / 2,
  },
  {
    id: 'low_key',
    reason: 'You both prefer low-key hangouts.',
    qualifies: (viewer, candidate) =>
      bothHigh(viewer.enjoyLowKeyHangouts, candidate.enjoyLowKeyHangouts) &&
      !bothHigh(viewer.preferOneOnOne, candidate.preferOneOnOne),
    strength: (viewer, candidate) =>
      (viewer.enjoyLowKeyHangouts + candidate.enjoyLowKeyHangouts) / 2,
  },
  {
    id: 'long_term',
    reason: 'You both want friendships that can grow deeper over time.',
    qualifies: (viewer, candidate) =>
      bothHigh(viewer.longTermMeaningful, candidate.longTermMeaningful),
    strength: (viewer, candidate) =>
      (viewer.longTermMeaningful + candidate.longTermMeaningful) / 2,
  },
  {
    id: 'local_events',
    reason: 'You both enjoy local events and trying new places.',
    qualifies: (viewer, candidate) => {
      const overlap = hangoutOverlap(viewer.idealHangouts, candidate.idealHangouts)
      return (
        overlap.includes('local_events') ||
        overlap.includes('shopping_exploring') ||
        (bothHigh(viewer.supportLocalCommunity, candidate.supportLocalCommunity) &&
          bothHigh(viewer.personalGrowthMatters, candidate.personalGrowthMatters))
      )
    },
    strength: (viewer, candidate) => {
      const overlap = hangoutOverlap(viewer.idealHangouts, candidate.idealHangouts)
      const hangoutBoost =
        overlap.includes('local_events') || overlap.includes('shopping_exploring')
          ? 1
          : 0
      return (
        hangoutBoost +
        (viewer.supportLocalCommunity + candidate.supportLocalCommunity) / 10
      )
    },
  },
  {
    id: 'direct_follow_through',
    reason: 'You both value direct communication and following through.',
    qualifies: (viewer, candidate) =>
      bothHigh(viewer.preferDirectCommunication, candidate.preferDirectCommunication) &&
      bothHigh(viewer.followThroughOnPlans, candidate.followThroughOnPlans),
    strength: (viewer, candidate) =>
      (viewer.preferDirectCommunication +
        candidate.preferDirectCommunication +
        viewer.followThroughOnPlans +
        candidate.followThroughOnPlans) /
      4,
  },
  {
    id: 'regular_group',
    reason: 'You both enjoy being part of a regular friend group.',
    qualifies: (viewer, candidate) =>
      bothHigh(viewer.enjoyRegularFriendGroup, candidate.enjoyRegularFriendGroup),
    strength: (viewer, candidate) =>
      (viewer.enjoyRegularFriendGroup + candidate.enjoyRegularFriendGroup) / 2,
  },
  {
    id: 'stay_in_touch',
    reason: 'You both like staying in touch between hangouts.',
    qualifies: (viewer, candidate) =>
      bothHigh(viewer.stayInTouchByText, candidate.stayInTouchByText),
    strength: (viewer, candidate) =>
      (viewer.stayInTouchByText + candidate.stayInTouchByText) / 2,
  },
  {
    id: 'kindness',
    reason: 'You both value kindness, inclusivity, and respect.',
    qualifies: (viewer, candidate) =>
      bothHigh(viewer.valueKindnessInclusivity, candidate.valueKindnessInclusivity),
    strength: (viewer, candidate) =>
      (viewer.valueKindnessInclusivity + candidate.valueKindnessInclusivity) / 2,
  },
  {
    id: 'support_local',
    reason: 'You both enjoy supporting local businesses and community spaces.',
    qualifies: (viewer, candidate) =>
      bothHigh(viewer.supportLocalCommunity, candidate.supportLocalCommunity),
    strength: (viewer, candidate) =>
      (viewer.supportLocalCommunity + candidate.supportLocalCommunity) / 2,
  },
  {
    id: 'playful_banter',
    reason: 'You both enjoy playful banter and humor.',
    qualifies: (viewer, candidate) =>
      bothHigh(viewer.enjoyPlayfulBanter, candidate.enjoyPlayfulBanter),
    strength: (viewer, candidate) =>
      (viewer.enjoyPlayfulBanter + candidate.enjoyPlayfulBanter) / 2,
  },
  {
    id: 'hosting',
    reason: 'You both enjoy hosting or being invited into friends’ homes.',
    qualifies: (viewer, candidate) =>
      bothHigh(viewer.enjoyHosting, candidate.enjoyHosting),
    strength: (viewer, candidate) => (viewer.enjoyHosting + candidate.enjoyHosting) / 2,
  },
  {
    id: 'active_outside',
    reason: 'You both enjoy staying active and getting outside.',
    qualifies: (viewer, candidate) =>
      bothHigh(viewer.stayActiveOutside, candidate.stayActiveOutside),
    strength: (viewer, candidate) =>
      (viewer.stayActiveOutside + candidate.stayActiveOutside) / 2,
  },
  {
    id: 'emotional_support',
    reason: 'You both want friends who are emotionally supportive.',
    qualifies: (viewer, candidate) =>
      bothHigh(viewer.wantEmotionalSupport, candidate.wantEmotionalSupport),
    strength: (viewer, candidate) =>
      (viewer.wantEmotionalSupport + candidate.wantEmotionalSupport) / 2,
  },
  {
    id: 'meeting_new_people',
    reason: 'You both like meeting new people and expanding your circle.',
    qualifies: (viewer, candidate) =>
      bothHigh(viewer.likeMeetingNewPeople, candidate.likeMeetingNewPeople),
    strength: (viewer, candidate) =>
      (viewer.likeMeetingNewPeople + candidate.likeMeetingNewPeople) / 2,
  },
  {
    id: 'giving_back',
    reason: 'You both care about giving back and helping others.',
    qualifies: (viewer, candidate) =>
      bothHigh(viewer.givingBackMatters, candidate.givingBackMatters),
    strength: (viewer, candidate) =>
      (viewer.givingBackMatters + candidate.givingBackMatters) / 2,
  },
  {
    id: 'personal_growth',
    reason: 'You both value personal growth and trying new things.',
    qualifies: (viewer, candidate) =>
      bothHigh(viewer.personalGrowthMatters, candidate.personalGrowthMatters),
    strength: (viewer, candidate) =>
      (viewer.personalGrowthMatters + candidate.personalGrowthMatters) / 2,
  },
  {
    id: 'family_time',
    reason: 'You both make family time an important part of life.',
    qualifies: (viewer, candidate) =>
      bothHigh(viewer.familyTimeImportant, candidate.familyTimeImportant),
    strength: (viewer, candidate) =>
      (viewer.familyTimeImportant + candidate.familyTimeImportant) / 2,
  },
  {
    id: 'initiating',
    reason: 'You’re both comfortable initiating plans.',
    qualifies: (viewer, candidate) =>
      bothHigh(viewer.comfortableInitiating, candidate.comfortableInitiating),
    strength: (viewer, candidate) =>
      (viewer.comfortableInitiating + candidate.comfortableInitiating) / 2,
  },
  {
    id: 'wide_circle',
    reason: 'You’re both open to a wide circle as well as deeper friendships.',
    qualifies: (viewer, candidate) =>
      bothHigh(viewer.wideCircleAndDeep, candidate.wideCircleAndDeep),
    strength: (viewer, candidate) =>
      (viewer.wideCircleAndDeep + candidate.wideCircleAndDeep) / 2,
  },
  {
    id: 'similar_time',
    reason: 'You’re looking for a similar amount of time with new friends.',
    qualifies: (viewer, candidate) =>
      viewer.desiredTimeTogether === candidate.desiredTimeTogether &&
      viewer.desiredTimeTogether !== 'flexible',
    strength: () => 4.5,
  },
  {
    id: 'close_friends_goal',
    reason: 'You’re both looking for one-on-one close friends.',
    qualifies: (viewer, candidate) => {
      const left = viewer.friendshipGoals
      const right = candidate.friendshipGoals
      return (
        (left.includes('one_on_one') || left.includes('mix_all')) &&
        (right.includes('one_on_one') || right.includes('mix_all'))
      )
    },
    strength: () => 4.2,
  },
]

const REDUNDANT_WITH_COMBINED = new Set(['one_on_one', 'low_key'])

export function deriveFriendshipMatchReasons(
  viewer: FriendshipQuestionnaireComplete,
  candidate: FriendshipQuestionnaireComplete
): string[] {
  const ranked: { id: string; reason: string; strength: number }[] = []

  for (const rule of BASE_RULES) {
    if (!rule.qualifies(viewer, candidate)) {
      continue
    }
    ranked.push({
      id: rule.id,
      reason: rule.reason,
      strength: rule.strength(viewer, candidate),
    })
  }

  const overlap = hangoutOverlap(viewer.idealHangouts, candidate.idealHangouts)
  const overlapScore = overlap.length
  for (const hangout of overlap) {
    const reason = HANGOUT_REASON_BY_VALUE[hangout]
    if (!reason) continue
    if (hangout === 'local_events' || hangout === 'shopping_exploring') {
      continue
    }
    ranked.push({
      id: `hangout_${hangout}`,
      reason,
      strength: 3 + overlapScore,
    })
  }

  const hasCombined = ranked.some((entry) => entry.id === 'low_key_one_on_one')
  const filtered = ranked.filter((entry) => {
    if (hasCombined && REDUNDANT_WITH_COMBINED.has(entry.id)) {
      return false
    }
    return true
  })

  const unique = [
    ...new Map(
      filtered
        .sort((left, right) => right.strength - left.strength)
        .map((entry) => [entry.reason, entry])
    ).values(),
  ]

  return unique.slice(0, 4).map((entry) => entry.reason)
}

export function reasonsAreMemberSafe(reasons: string[]): boolean {
  const joined = reasons.join(' ').toLowerCase()
  return (
    !joined.includes('alcohol') &&
    !joined.includes('percent') &&
    !/%/.test(joined) &&
    !joined.includes('priority') &&
    !/\b[1-5]\b/.test(joined)
  )
}
