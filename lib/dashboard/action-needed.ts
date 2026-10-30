import type { CompatibilityProfileStatus } from '@/lib/compatibility/profile-status'
import type { FriendshipAccessStatus } from '@/lib/friendship/types'
import {
  MATCHING_IDENTITY_CTA,
  MATCHING_IDENTITY_HREF,
  MATCHING_IDENTITY_PENDING_DETAIL,
  MATCHING_IDENTITY_REQUIRED_DETAIL,
  MATCHING_IDENTITY_REVIEW_CTA,
  MATCHING_IDENTITY_UNAVAILABLE_DETAIL,
} from '@/lib/matching-identity'

export type DashboardActionNeededKind =
  | 'dating_questionnaire'
  | 'friend_questionnaire'
  | 'dating_upgrade'
  | 'friends_upgrade'
  | 'matching_identity'
  | 'profile_completion'

export type DashboardActionNeededCard = {
  kind: DashboardActionNeededKind
  title: string
  description: string
  ctaLabel: string
  href: string
}

export const DASHBOARD_ACTION_NEEDED_COPY = {
  dating_questionnaire: {
    title: 'Complete your Dating Questionnaire',
    description:
      'Share a few more details so we can begin identifying compatible dating connections.',
    ctaLabel: 'Complete questionnaire',
    href: '/compatibility',
  },
  friend_questionnaire: {
    title: 'Complete your Friend Questionnaire',
    description:
      'Share what you are looking for in friendship so we can begin identifying compatible members.',
    ctaLabel: 'Complete questionnaire',
    href: '/friendship',
  },
  dating_upgrade: {
    title: 'Unlock Dating Matches',
    description: 'Upgrade your membership to access personalized dating matches.',
    ctaLabel: 'View membership options',
    href: '/upgrade',
  },
  friends_upgrade: {
    title: 'Unlock Matched Friends',
    description: 'Upgrade your membership to access personalized friend matches.',
    ctaLabel: 'View membership options',
    href: '/upgrade',
  },
  matching_identity: {
    title: 'Verify your identity to take part in matching',
    description: MATCHING_IDENTITY_REQUIRED_DETAIL,
    ctaLabel: MATCHING_IDENTITY_CTA,
    href: MATCHING_IDENTITY_HREF,
  },
  profile_completion: {
    title: 'Complete your profile',
    description:
      'Add the remaining details that help other members get to know you.',
    ctaLabel: 'Complete profile',
    href: '/profile',
  },
} as const

const DATING_QUESTIONNAIRE_STATUSES: CompatibilityProfileStatus[] = [
  'questionnaire_needed',
  'questionnaire_in_progress',
]

const FRIEND_QUESTIONNAIRE_STATUSES: FriendshipAccessStatus[] = [
  'questionnaire_needed',
  'questionnaire_in_progress',
]

function cardFor(kind: DashboardActionNeededKind): DashboardActionNeededCard {
  const copy = DASHBOARD_ACTION_NEEDED_COPY[kind]
  return {
    kind,
    title: copy.title,
    description: copy.description,
    ctaLabel: copy.ctaLabel,
    href: copy.href,
  }
}

export function buildDashboardActionNeeded(input: {
  datingStatus: CompatibilityProfileStatus
  friendshipStatus: FriendshipAccessStatus
  profileCompletionPercent: number
  datingMatchingEnabled: boolean
  friendshipMatchingEnabled: boolean
}): DashboardActionNeededCard[] {
  const cards: DashboardActionNeededCard[] = []
  const identityState = matchingIdentityActionState(
    input.datingStatus,
    input.friendshipStatus
  )
  if (identityState) {
    cards.push(matchingIdentityCard(identityState))
  }

  if (
    input.datingMatchingEnabled &&
    DATING_QUESTIONNAIRE_STATUSES.includes(input.datingStatus)
  ) {
    cards.push(cardFor('dating_questionnaire'))
  }

  if (
    input.friendshipMatchingEnabled &&
    FRIEND_QUESTIONNAIRE_STATUSES.includes(input.friendshipStatus)
  ) {
    cards.push(cardFor('friend_questionnaire'))
  }

  if (input.datingMatchingEnabled && input.datingStatus === 'no_messaging') {
    cards.push(cardFor('dating_upgrade'))
  }

  if (
    input.friendshipMatchingEnabled &&
    input.friendshipStatus === 'no_messaging'
  ) {
    cards.push(cardFor('friends_upgrade'))
  }

  if (input.profileCompletionPercent < 100) {
    cards.push(cardFor('profile_completion'))
  }

  return cards
}

const IDENTITY_ACTION_STATES = [
  'identity_unavailable',
  'identity_pending',
  'identity_required',
] as const

type IdentityActionState = (typeof IDENTITY_ACTION_STATES)[number]

function matchingIdentityActionState(
  datingStatus: CompatibilityProfileStatus,
  friendshipStatus: FriendshipAccessStatus
): IdentityActionState | null {
  const states = [datingStatus, friendshipStatus].filter(
    (status): status is IdentityActionState =>
      IDENTITY_ACTION_STATES.includes(status as IdentityActionState)
  )
  if (states.includes('identity_unavailable')) return 'identity_unavailable'
  if (states.includes('identity_pending')) return 'identity_pending'
  if (states.includes('identity_required')) return 'identity_required'
  return null
}

function matchingIdentityCard(
  state: IdentityActionState
): DashboardActionNeededCard {
  if (state === 'identity_unavailable') {
    return {
      kind: 'matching_identity',
      title: 'Verify your identity to take part in matching',
      description: MATCHING_IDENTITY_UNAVAILABLE_DETAIL,
      ctaLabel: MATCHING_IDENTITY_REVIEW_CTA,
      href: MATCHING_IDENTITY_HREF,
    }
  }
  if (state === 'identity_pending') {
    return {
      kind: 'matching_identity',
      title: 'Verify your identity to take part in matching',
      description: MATCHING_IDENTITY_PENDING_DETAIL,
      ctaLabel: MATCHING_IDENTITY_CTA,
      href: MATCHING_IDENTITY_HREF,
    }
  }
  return cardFor('matching_identity')
}
