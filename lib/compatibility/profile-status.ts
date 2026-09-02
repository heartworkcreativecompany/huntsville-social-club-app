import {
  canGenerateMatches,
  hasMessagingEntitlement,
  isApprovedMember,
  isCompatibilityFeatureEnabled,
  isDatingConnectionSelected,
  isUserPaused,
  type MessagingEntitlementInput,
} from '@/lib/compatibility/eligibility'
import {
  isCompatibilityQuestionnaireEffectivelyComplete,
  questionnaireHasAnyAnswers,
} from '@/lib/compatibility/questionnaire'
import type { CompatibilityProfileFields } from '@/lib/compatibility/types'

export type CompatibilityProfileStatus =
  | 'disabled'
  | 'not_approved'
  | 'no_dating'
  | 'no_messaging'
  | 'paused'
  | 'questionnaire_needed'
  | 'questionnaire_in_progress'
  | 'active'
  | 'paused_system'

export type CompatibilityStatusSummary = {
  status: CompatibilityProfileStatus
  headline: string
  detail: string
  showCard: boolean
  ctaHref: string | null
  ctaLabel: string | null
}

function pauseReasonLabel(
  reason: CompatibilityProfileFields['curated_matches_pause_reason']
): string {
  switch (reason) {
    case 'user_paused':
      return 'You paused curated matches.'
    case 'dating_removed':
      return 'Dating was removed from your profile.'
    case 'subscription_inactive':
      return 'Your paid membership is inactive.'
    case 'not_approved':
      return 'Your membership is not approved.'
    default:
      return 'Curated matches are paused.'
  }
}

const CURATED_MATCHES_FEATURE_DISABLED_COPY =
  'Curated Matches are not available right now.'

const CURATED_MATCHES_PAID_ONLY_COPY =
  'Curated Matches are not available right now. This feature is only available for paid members.'

export function summarizeCompatibilityProfileStatus(input: {
  profile: CompatibilityProfileFields & {
    compatibility_questionnaire?: unknown
  }
  entitlementInput: MessagingEntitlementInput
}): CompatibilityStatusSummary {
  const { profile, entitlementInput } = input

  if (!isCompatibilityFeatureEnabled()) {
    return {
      status: 'disabled',
      headline: 'Curated matches',
      detail: CURATED_MATCHES_FEATURE_DISABLED_COPY,
      showCard: true,
      ctaHref: null,
      ctaLabel: null,
    }
  }

  if (!isApprovedMember(profile.application_status)) {
    return {
      status: 'not_approved',
      headline: 'Curated matches',
      detail: 'Available after your membership application is approved.',
      showCard: true,
      ctaHref: '/application/status',
      ctaLabel: 'View application status',
    }
  }

  if (!isDatingConnectionSelected(profile.connection_intents)) {
    return {
      status: 'no_dating',
      headline: 'Curated matches',
      detail:
        'Curated matches are for members open to dating. Add Dating under connection preferences on your profile, then submit for review.',
      showCard: true,
      ctaHref: '/profile',
      ctaLabel: 'Edit profile',
    }
  }

  if (!hasMessagingEntitlement(entitlementInput)) {
    return {
      status: 'no_messaging',
      headline: 'Curated matches',
      detail: CURATED_MATCHES_PAID_ONLY_COPY,
      showCard: true,
      ctaHref: '/upgrade',
      ctaLabel: 'View memberships',
    }
  }

  if (profile.wants_curated_matches === false) {
    return {
      status: 'paused',
      headline: 'Curated matches paused',
      detail: 'You opted out of curated match recommendations.',
      showCard: true,
      ctaHref: '/compatibility',
      ctaLabel: 'Manage compatibility',
    }
  }

  if (
    profile.curated_matches_paused_at != null &&
    profile.curated_matches_pause_reason &&
    profile.curated_matches_pause_reason !== 'user_paused'
  ) {
    return {
      status: 'paused_system',
      headline: 'Curated matches paused',
      detail: pauseReasonLabel(profile.curated_matches_pause_reason),
      showCard: true,
      ctaHref: profile.curated_matches_pause_reason === 'subscription_inactive'
        ? '/upgrade'
        : '/profile',
      ctaLabel:
        profile.curated_matches_pause_reason === 'subscription_inactive'
          ? 'View memberships'
          : 'Edit profile',
    }
  }

  if (isUserPaused(profile) && profile.curated_matches_pause_reason === 'user_paused') {
    return {
      status: 'paused',
      headline: 'Curated matches paused',
      detail: pauseReasonLabel('user_paused'),
      showCard: true,
      ctaHref: '/compatibility',
      ctaLabel: 'Manage compatibility',
    }
  }

  const questionnaireComplete = isCompatibilityQuestionnaireEffectivelyComplete(
    profile
  )

  if (!questionnaireComplete) {
    if (questionnaireHasAnyAnswers(profile.compatibility_questionnaire)) {
      return {
        status: 'questionnaire_in_progress',
        headline: 'Compatibility questionnaire',
        detail:
          'Your private questionnaire is in progress. Complete every section to receive curated match recommendations.',
        showCard: true,
        ctaHref: '/compatibility',
        ctaLabel: 'Continue questionnaire',
      }
    }

    return {
      status: 'questionnaire_needed',
      headline: 'Curated matches',
      detail:
        'Unlock curated matches by filling out a private compatibility questionnaire.',
      showCard: true,
      ctaHref: '/compatibility',
      ctaLabel: 'Start questionnaire',
    }
  }

  if (canGenerateMatches(profile, entitlementInput)) {
    return {
      status: 'active',
      headline: 'Curated matches active',
      detail:
        'Your questionnaire is complete. View your curated recommendations and connect when you are ready.',
      showCard: true,
      ctaHref: '/matches/dating',
      ctaLabel: 'View matches',
    }
  }

  return {
    status: 'questionnaire_needed',
    headline: 'Curated matches',
    detail:
      'Unlock curated matches by filling out a private compatibility questionnaire.',
    showCard: true,
    ctaHref: '/compatibility',
    ctaLabel: 'Start questionnaire',
  }
}
