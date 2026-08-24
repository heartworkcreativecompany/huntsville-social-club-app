import type { COMPATIBILITY_QUESTIONNAIRE_VERSION } from '@/lib/compatibility/questionnaire-config'

export const DATING_CONNECTION_OPTION = 'Dating' as const

export type CuratedMatchPauseReason =
  | 'user_paused'
  | 'dating_removed'
  | 'subscription_inactive'
  | 'not_approved'

export type CuratedMatchBatchStatus =
  | 'scheduled'
  | 'processing'
  | 'delivered'
  | 'empty'
  | 'cancelled'

export type CuratedMatchRecommendationStatus =
  | 'pending'
  | 'viewed'
  | 'accepted'
  | 'passed'
  | 'declined'
  | 'expired'

export type CompatibilityGender =
  | 'woman'
  | 'man'
  | 'non_binary'
  | 'self_describe'
  | 'prefer_not_to_say'

export type CompatibilityMatchInterest =
  | 'women'
  | 'men'
  | 'non_binary'
  | 'open_to_all'

export type CompatibilityFamilySituation =
  | 'no_children'
  | 'children_full_time'
  | 'children_part_time'
  | 'grown_children'
  | 'hope_future_children'
  | 'prefer_not_to_say'

export type CompatibilityOrdinalAnswer = 1 | 2 | 3 | 4 | 5

/** Private questionnaire payload stored on profiles.compatibility_questionnaire. */
export type CompatibilityQuestionnaireV2 = {
  version: typeof COMPATIBILITY_QUESTIONNAIRE_VERSION
  gender: CompatibilityGender
  genderSelfDescribe: string | null
  age: number
  preferredMatchAgeMin: number
  preferredMatchAgeMax: number
  matchInterests: CompatibilityMatchInterest[]
  relationshipIntention: CompatibilityOrdinalAnswer
  faithValues: CompatibilityOrdinalAnswer
  valuesVsChemistry: CompatibilityOrdinalAnswer
  partnershipDailyLife: CompatibilityOrdinalAnswer
  socialRhythm: CompatibilityOrdinalAnswer
  saturdayStyle: CompatibilityOrdinalAnswer
  planningSpontaneity: CompatibilityOrdinalAnswer
  ambition: CompatibilityOrdinalAnswer
  maritalHistory: CompatibilityOrdinalAnswer
  familySituation: CompatibilityFamilySituation[]
  openToPartnerWithChildren: CompatibilityOrdinalAnswer
  futureChildren: CompatibilityOrdinalAnswer
  openToDivorced: CompatibilityOrdinalAnswer
  partnerHistoryPreference: CompatibilityOrdinalAnswer
  stayingActiveImportant: CompatibilityOrdinalAnswer
  enjoyDancingSocially: CompatibilityOrdinalAnswer
  enjoyEdgyHumor: CompatibilityOrdinalAnswer
  preferLowKeyHangouts: CompatibilityOrdinalAnswer
  needStructureOrganization: CompatibilityOrdinalAnswer
  spontaneousPlanReady: CompatibilityOrdinalAnswer
  preferOneOnOne: CompatibilityOrdinalAnswer
  sharedValuesOverHobbies: CompatibilityOrdinalAnswer
  likePlayfulBanter: CompatibilityOrdinalAnswer
  loveLanguagesImportant: CompatibilityOrdinalAnswer
  extendedFamilyTimeImportant: CompatibilityOrdinalAnswer
  enjoyHostingGatherings: CompatibilityOrdinalAnswer
  drinkAlcoholRegularly: CompatibilityOrdinalAnswer
  smokeRegularly: CompatibilityOrdinalAnswer
  animalCompanyImportant: CompatibilityOrdinalAnswer
  /** Preserved from the Phase 1 scaffold when upgrading in place. */
  legacyRelationshipGoals?: string
  legacyCommunicationStyle?: string
}

/** In-progress saves may omit unanswered fields until completion. */
export type CompatibilityQuestionnaireStored = {
  version: typeof COMPATIBILITY_QUESTIONNAIRE_VERSION
} & Partial<Omit<CompatibilityQuestionnaireV2, 'version'>>

/** Phase 1 scaffold — not sufficient for completion. */
export type CompatibilityQuestionnaireV1 = {
  version: 1
  relationshipGoals?: string
  communicationStyle?: string
}

export type CompatibilityQuestionnaire =
  | CompatibilityQuestionnaireV2
  | CompatibilityQuestionnaireStored
  | CompatibilityQuestionnaireV1

export type CompatibilityProfileFields = {
  application_status: string | null
  connection_intents: string[] | null
  connections_open_to: string[] | null
  compatibility_questionnaire?: unknown
  compatibility_completed_at: string | null
  wants_curated_matches: boolean | null
  curated_matches_paused_at: string | null
  curated_matches_pause_reason: CuratedMatchPauseReason | null
  dating_connection_enabled_at: string | null
  dating_connection_removed_at: string | null
  messaging_entitlement_lost_at: string | null
  messaging_entitlement_restored_at: string | null
  role?: string | null
  membership_billing?: unknown
  age?: number | null
  preferred_match_age_min?: number | null
  preferred_match_age_max?: number | null
}

export type DatingConnectionChange =
  | { type: 'none' }
  | { type: 'added' }
  | { type: 'removed' }
