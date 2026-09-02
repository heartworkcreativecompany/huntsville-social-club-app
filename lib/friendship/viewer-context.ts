import { compatibilityEntitlementInputFromViewer } from '@/lib/compatibility/viewer-context'
import {
  evaluateFriendshipAccess,
  isFriendshipMatchingEnabled,
} from '@/lib/friendship/eligibility'
import { includesFriendsIntent } from '@/lib/member-public-intent'
import type { FriendshipQuestionnaireRow } from '@/lib/friendship/types'
import type { MemberEntitlements } from '@/lib/membership-entitlements'
import type { Viewer } from '@/lib/viewer'

/** Intent + feature-flag nav only. Does not consider paid access or questionnaire state. */
export function canShowFriendsMatchesNav(viewer: Viewer): boolean {
  const profile = viewer.profile
  if (!profile || profile.application_status !== 'approved') {
    return false
  }

  return (
    isFriendshipMatchingEnabled() &&
    includesFriendsIntent(profile.connection_intents)
  )
}

export function friendshipContextForViewer(
  viewer: Viewer,
  entitlements: MemberEntitlements | null,
  questionnaire: FriendshipQuestionnaireRow | null
) {
  const friendsIntent = includesFriendsIntent(viewer.profile?.connection_intents)
  const entitlementInput = compatibilityEntitlementInputFromViewer(
    viewer,
    entitlements
  )

  const access = evaluateFriendshipAccess({
    signedIn: true,
    approved: viewer.canAccessApp,
    friendsIntent,
    entitlementInput,
    questionnaire,
  })

  return {
    friendsIntent,
    access,
    canAccessFriendsNav: access.canViewMatches,
  }
}
