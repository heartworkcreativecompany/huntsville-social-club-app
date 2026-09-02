import type { CompatibilityProfileStatus } from '@/lib/compatibility/profile-status'
import type { FriendshipAccessStatus } from '@/lib/friendship/types'

export type DashboardActionNeededKind =
  | 'dating_questionnaire'
  | 'friend_questionnaire'
  | 'dating_upgrade'
  | 'friends_upgrade'
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
