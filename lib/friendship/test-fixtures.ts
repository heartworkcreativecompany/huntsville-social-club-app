import type {
  FriendshipQuestionnaireAnswers,
  FriendshipQuestionnaireComplete,
} from '@/lib/friendship/types'
import { buildFriendshipQuestionnaire } from '@/lib/friendship/questionnaire'
import { FRIENDSHIP_QUESTIONNAIRE_VERSION } from '@/lib/friendship/questionnaire-config'

export const innerCircleBilling = {
  tier: 'inner_circle' as const,
  subscription_status: 'active' as const,
  plan: 'monthly' as const,
  stripe_customer_id: 'cus_test',
  stripe_subscription_id: 'sub_test',
  stripe_price_id: 'price_test',
  renewal_at: null,
  billing_period_start: null,
  billing_period_end: null,
  trial_end: null,
  cancelled_at: null,
  plan_change_pending: null,
  payment_failure: { active: false, since: null, reminder_sent_at: null },
  application_fee: { status: 'paid' as const, paid_at: null },
}

export const freeMemberBilling = {
  ...innerCircleBilling,
  tier: 'member' as const,
  subscription_status: 'none' as const,
  stripe_customer_id: null,
  stripe_subscription_id: null,
  stripe_price_id: null,
}

export function completeFriendshipAnswers(
  overrides: Partial<FriendshipQuestionnaireAnswers> = {}
): FriendshipQuestionnaireAnswers {
  return {
    friendshipGoals: ['one_on_one', 'activity_hobby'],
    desiredTimeTogether: 'once_week',
    longTermMeaningful: 5,
    wideCircleAndDeep: 4,
    rechargeWithPeople: 4,
    preferOneOnOne: 5,
    enjoyRegularFriendGroup: 3,
    likeMeetingNewPeople: 4,
    preferSpontaneousPlans: 3,
    comfortableInitiating: 4,
    idealHangouts: ['coffee_brunch', 'local_events', 'staying_in'],
    stayActiveOutside: 4,
    enjoyLowKeyHangouts: 5,
    likeNightlife: 2,
    preferStructuredSchedule: 3,
    openToLastMinutePlans: 4,
    alcoholFrequency: 'prefer_not_to_answer',
    alcoholComfort: 'prefer_not_to_answer',
    petsImportant: 4,
    enjoyHosting: 4,
    stayInTouchByText: 4,
    preferDirectCommunication: 5,
    followThroughOnPlans: 5,
    appreciateCheckIns: 4,
    comfortableTalkingPersonal: 4,
    preferTalkAboutIssues: 4,
    valueKindnessInclusivity: 5,
    supportLocalCommunity: 4,
    givingBackMatters: 4,
    personalGrowthMatters: 4,
    familyTimeImportant: 3,
    enjoyPlayfulBanter: 4,
    humorCanBeEdgy: 2,
    wantEmotionalSupport: 5,
    friendshipPriorities: [
      'shared_interests',
      'communication_reliability',
      'emotional_support',
    ],
    ...overrides,
  }
}

export function completeFriendshipQuestionnaire(
  overrides: Partial<FriendshipQuestionnaireAnswers> = {}
): FriendshipQuestionnaireComplete {
  return buildFriendshipQuestionnaire(
    completeFriendshipAnswers(overrides)
  ) as FriendshipQuestionnaireComplete
}

export function submittedFriendshipRow(
  overrides: Partial<FriendshipQuestionnaireAnswers> = {}
) {
  return {
    user_id: 'user-1',
    version: FRIENDSHIP_QUESTIONNAIRE_VERSION,
    answers: completeFriendshipQuestionnaire(overrides),
    status: 'submitted' as const,
    completed_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  }
}
