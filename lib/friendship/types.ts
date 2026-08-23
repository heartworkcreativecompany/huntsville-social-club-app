import type { FRIENDSHIP_QUESTIONNAIRE_VERSION } from '@/lib/friendship/questionnaire-config'
import type { MessagingEntitlementInput } from '@/lib/compatibility/eligibility'

export type FriendshipOrdinalAnswer = 1 | 2 | 3 | 4 | 5

export type FriendshipQuestionnaireStatus = 'draft' | 'submitted'

export type FriendshipQuestionnaireAnswers = {
  friendshipGoals: string[]
  desiredTimeTogether: string
  longTermMeaningful: number | null
  wideCircleAndDeep: number | null
  rechargeWithPeople: number | null
  preferOneOnOne: number | null
  enjoyRegularFriendGroup: number | null
  likeMeetingNewPeople: number | null
  preferSpontaneousPlans: number | null
  comfortableInitiating: number | null
  idealHangouts: string[]
  stayActiveOutside: number | null
  enjoyLowKeyHangouts: number | null
  likeNightlife: number | null
  preferStructuredSchedule: number | null
  openToLastMinutePlans: number | null
  alcoholFrequency: string
  alcoholComfort: string
  petsImportant: number | null
  enjoyHosting: number | null
  stayInTouchByText: number | null
  preferDirectCommunication: number | null
  followThroughOnPlans: number | null
  appreciateCheckIns: number | null
  comfortableTalkingPersonal: number | null
  preferTalkAboutIssues: number | null
  valueKindnessInclusivity: number | null
  supportLocalCommunity: number | null
  givingBackMatters: number | null
  personalGrowthMatters: number | null
  familyTimeImportant: number | null
  enjoyPlayfulBanter: number | null
  humorCanBeEdgy: number | null
  wantEmotionalSupport: number | null
  friendshipPriorities: string[]
}

export type FriendshipQuestionnaireStored = {
  version: typeof FRIENDSHIP_QUESTIONNAIRE_VERSION
} & Partial<FriendshipQuestionnaireAnswers>

export type FriendshipQuestionnaireComplete = {
  version: typeof FRIENDSHIP_QUESTIONNAIRE_VERSION
  friendshipGoals: string[]
  desiredTimeTogether: string
  longTermMeaningful: FriendshipOrdinalAnswer
  wideCircleAndDeep: FriendshipOrdinalAnswer
  rechargeWithPeople: FriendshipOrdinalAnswer
  preferOneOnOne: FriendshipOrdinalAnswer
  enjoyRegularFriendGroup: FriendshipOrdinalAnswer
  likeMeetingNewPeople: FriendshipOrdinalAnswer
  preferSpontaneousPlans: FriendshipOrdinalAnswer
  comfortableInitiating: FriendshipOrdinalAnswer
  idealHangouts: string[]
  stayActiveOutside: FriendshipOrdinalAnswer
  enjoyLowKeyHangouts: FriendshipOrdinalAnswer
  likeNightlife: FriendshipOrdinalAnswer
  preferStructuredSchedule: FriendshipOrdinalAnswer
  openToLastMinutePlans: FriendshipOrdinalAnswer
  alcoholFrequency: string
  alcoholComfort: string
  petsImportant: FriendshipOrdinalAnswer
  enjoyHosting: FriendshipOrdinalAnswer
  stayInTouchByText: FriendshipOrdinalAnswer
  preferDirectCommunication: FriendshipOrdinalAnswer
  followThroughOnPlans: FriendshipOrdinalAnswer
  appreciateCheckIns: FriendshipOrdinalAnswer
  comfortableTalkingPersonal: FriendshipOrdinalAnswer
  preferTalkAboutIssues: FriendshipOrdinalAnswer
  valueKindnessInclusivity: FriendshipOrdinalAnswer
  supportLocalCommunity: FriendshipOrdinalAnswer
  givingBackMatters: FriendshipOrdinalAnswer
  personalGrowthMatters: FriendshipOrdinalAnswer
  familyTimeImportant: FriendshipOrdinalAnswer
  enjoyPlayfulBanter: FriendshipOrdinalAnswer
  humorCanBeEdgy: FriendshipOrdinalAnswer
  wantEmotionalSupport: FriendshipOrdinalAnswer
  friendshipPriorities: string[]
}

export type FriendshipQuestionnaireRow = {
  user_id: string
  version: number
  answers: unknown
  status: FriendshipQuestionnaireStatus | string
  completed_at: string | null
  updated_at: string | null
}

export type FriendshipProfileFields = {
  application_status: string | null
  connection_intents: string[] | null
  role?: string | null
  membership_billing?: unknown
}

export type FriendshipAccessStatus =
  | 'not_signed_in'
  | 'not_approved'
  | 'no_friends'
  | 'no_messaging'
  | 'questionnaire_needed'
  | 'questionnaire_in_progress'
  | 'matching_unavailable'
  | 'active'

export type FriendshipAccessInput = {
  signedIn: boolean
  approved: boolean
  friendsIntent: boolean
  entitlementInput: MessagingEntitlementInput
  questionnaire: FriendshipQuestionnaireRow | null
}

export type FriendshipFitLabel =
  | 'Strong friendship fit'
  | 'Promising connection'
  | 'Shared interests to explore'

export type FriendshipDimensionId =
  | 'goals'
  | 'social'
  | 'lifestyle'
  | 'communication'
  | 'values'
