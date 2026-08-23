import { hasMessagingEntitlement } from '@/lib/compatibility/eligibility'
import { includesFriendsIntent } from '@/lib/member-public-intent'
import {
  isFriendshipQuestionnaireSubmitted,
  resolveFriendshipQuestionnaireState,
} from '@/lib/friendship/questionnaire'
import type {
  FriendshipAccessInput,
  FriendshipAccessStatus,
  FriendshipProfileFields,
} from '@/lib/friendship/types'

export const FRIENDSHIP_PAID_LOCK_HEADING =
  'Friendship compatibility is available with a paid membership.'
export const FRIENDSHIP_PAID_LOCK_BODY =
  'Complete your Friendship Questionnaire to receive more meaningful friend recommendations.'
export const FRIENDSHIP_PAID_LOCK_CTA = 'Upgrade membership'
export const FRIENDSHIP_UPGRADE_HREF = '/upgrade'

export const FRIENDSHIP_MUTATION_DENIED_UNPAID =
  'A paid membership is required to save or score the Friendship Questionnaire.'
export const FRIENDSHIP_MUTATION_DENIED_NO_FRIENDS =
  'Friendship compatibility is available to members who selected Friends as a connection preference.'
export const FRIENDSHIP_MUTATION_DENIED_UNAPPROVED =
  'Membership approval is required.'

export const FRIENDSHIP_MATCHING_UNAVAILABLE_HEADING =
  'Friend recommendations are being prepared.'
export const FRIENDSHIP_MATCHING_UNAVAILABLE_BODY =
  'Your Friendship Questionnaire is saved. Recommendations will appear here when matching is available.'

/** Independent of Dating’s COMPATIBILITY_MATCHING_ENABLED. Absent/false → disabled. */
export function isFriendshipMatchingEnabled(): boolean {
  return process.env.FRIENDSHIP_MATCHING_ENABLED === 'true'
}

export function isFriendsConnectionSelected(
  connectionIntents: string[] | null | undefined
): boolean {
  return includesFriendsIntent(connectionIntents)
}

export function isFriendshipEligible(
  profile: FriendshipProfileFields,
  entitlementInput: FriendshipAccessInput['entitlementInput']
): boolean {
  if (profile.application_status !== 'approved') {
    return false
  }
  if (!isFriendsConnectionSelected(profile.connection_intents)) {
    return false
  }
  return hasMessagingEntitlement(entitlementInput)
}

export function canGenerateFriendshipMatches(
  profile: FriendshipProfileFields,
  entitlementInput: FriendshipAccessInput['entitlementInput'],
  questionnaire: {
    answers?: unknown
    status?: string | null
    completed_at?: string | null
  } | null
): boolean {
  if (!isFriendshipMatchingEnabled()) {
    return false
  }

  if (!isFriendshipEligible(profile, entitlementInput)) {
    return false
  }

  return isFriendshipQuestionnaireSubmitted({
    answers: questionnaire?.answers,
    status: questionnaire?.status,
    completed_at: questionnaire?.completed_at,
  })
}

export function evaluateFriendshipAccess(
  input: FriendshipAccessInput
): {
  status: FriendshipAccessStatus
  canViewSection: boolean
  canViewForm: boolean
  canMutate: boolean
  canViewMatches: boolean
  canScore: boolean
  headline: string
  detail: string
  ctaHref: string | null
  ctaLabel: string | null
  mutationError: string | null
} {
  if (!input.signedIn) {
    return {
      status: 'not_signed_in',
      canViewSection: false,
      canViewForm: false,
      canMutate: false,
      canViewMatches: false,
      canScore: false,
      headline: 'Friendship compatibility',
      detail: 'You must be signed in.',
      ctaHref: '/login',
      ctaLabel: 'Sign in',
      mutationError: 'You must be signed in.',
    }
  }

  if (!input.approved) {
    return {
      status: 'not_approved',
      canViewSection: false,
      canViewForm: false,
      canMutate: false,
      canViewMatches: false,
      canScore: false,
      headline: 'Friendship compatibility',
      detail: 'Available after your membership application is approved.',
      ctaHref: '/application/status',
      ctaLabel: 'View application status',
      mutationError: FRIENDSHIP_MUTATION_DENIED_UNAPPROVED,
    }
  }

  if (!input.friendsIntent) {
    return {
      status: 'no_friends',
      canViewSection: false,
      canViewForm: false,
      canMutate: false,
      canViewMatches: false,
      canScore: false,
      headline: 'Friendship compatibility',
      detail:
        'Friendship recommendations are for members open to making friends. Add Friends under connection preferences on your profile, then submit for review.',
      ctaHref: '/profile',
      ctaLabel: 'Edit profile',
      mutationError: FRIENDSHIP_MUTATION_DENIED_NO_FRIENDS,
    }
  }

  if (!hasMessagingEntitlement(input.entitlementInput)) {
    return {
      status: 'no_messaging',
      canViewSection: true,
      canViewForm: false,
      canMutate: false,
      canViewMatches: false,
      canScore: false,
      headline: FRIENDSHIP_PAID_LOCK_HEADING,
      detail: FRIENDSHIP_PAID_LOCK_BODY,
      ctaHref: FRIENDSHIP_UPGRADE_HREF,
      ctaLabel: FRIENDSHIP_PAID_LOCK_CTA,
      mutationError: FRIENDSHIP_MUTATION_DENIED_UNPAID,
    }
  }

  const state = resolveFriendshipQuestionnaireState(input.questionnaire)

  if (state === 'complete') {
    if (!isFriendshipMatchingEnabled()) {
      return {
        status: 'matching_unavailable',
        canViewSection: true,
        canViewForm: true,
        canMutate: true,
        canViewMatches: true,
        canScore: false,
        headline: FRIENDSHIP_MATCHING_UNAVAILABLE_HEADING,
        detail: FRIENDSHIP_MATCHING_UNAVAILABLE_BODY,
        ctaHref: '/friendship/matches',
        ctaLabel: 'See status',
        mutationError: null,
      }
    }

    return {
      status: 'active',
      canViewSection: true,
      canViewForm: true,
      canMutate: true,
      canViewMatches: true,
      canScore: true,
      headline: 'Friendship compatibility active',
      detail:
        'Your Friendship Questionnaire is complete. View friend recommendations and update answers anytime.',
      ctaHref: '/friendship/matches',
      ctaLabel: 'View friend recommendations',
      mutationError: null,
    }
  }

  if (state === 'in_progress') {
    return {
      status: 'questionnaire_in_progress',
      canViewSection: true,
      canViewForm: true,
      canMutate: true,
      canViewMatches: false,
      canScore: false,
      headline: 'Friendship questionnaire',
      detail:
        'Your private Friendship Questionnaire is in progress. Complete every section to receive friend recommendations.',
      ctaHref: '/friendship',
      ctaLabel: 'Continue questionnaire',
      mutationError: null,
    }
  }

  return {
    status: 'questionnaire_needed',
    canViewSection: true,
    canViewForm: true,
    canMutate: true,
    canViewMatches: false,
    canScore: false,
    headline: 'Friendship compatibility',
    detail:
      'Complete your Friendship Questionnaire to receive more meaningful friend recommendations.',
    ctaHref: '/friendship',
    ctaLabel: 'Start questionnaire',
    mutationError: null,
  }
}

export function assertCanMutateFriendshipQuestionnaire(input: FriendshipAccessInput): {
  ok: true
} | { ok: false; error: string } {
  const access = evaluateFriendshipAccess(input)
  if (!access.canMutate) {
    return { ok: false, error: access.mutationError ?? FRIENDSHIP_MUTATION_DENIED_UNPAID }
  }
  return { ok: true }
}

export function assertCanScoreFriendshipQuestionnaire(input: FriendshipAccessInput): {
  ok: true
} | { ok: false; error: string } {
  if (!isFriendshipMatchingEnabled()) {
    return { ok: false, error: 'Friendship matching is not available yet.' }
  }

  const access = evaluateFriendshipAccess(input)
  if (!access.canScore) {
    return {
      ok: false,
      error: access.mutationError ?? FRIENDSHIP_MUTATION_DENIED_UNPAID,
    }
  }
  return { ok: true }
}
