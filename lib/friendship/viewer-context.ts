import { compatibilityEntitlementInputFromViewer } from '@/lib/compatibility/viewer-context'
import { hasCuratedMatchingEntitlement } from '@/lib/compatibility/eligibility'
import {
  evaluateFriendshipAccess,
  isFriendshipMatchingEnabled,
} from '@/lib/friendship/eligibility'
import { includesFriendsIntent } from '@/lib/member-public-intent'
import type { FriendshipQuestionnaireRow } from '@/lib/friendship/types'
import type { MemberEntitlements } from '@/lib/membership-entitlements'
import type { MatchingIdentityPresentation } from '@/lib/matching-identity'
import { isMessagingSuspended } from '@/lib/messaging-suspension'
import type { Viewer } from '@/lib/viewer'

/** Approved + intent + feature flag + curated matching entitlement. */
export function canShowFriendsMatchesNav(
  viewer: Viewer,
  entitlements?: MemberEntitlements | null
): boolean {
  const profile = viewer.profile
  if (!profile || profile.application_status !== 'approved') {
    return false
  }

  if (
    !isFriendshipMatchingEnabled() ||
    !includesFriendsIntent(profile.connection_intents)
  ) {
    return false
  }

  if (entitlements) {
    return entitlements.canUseCuratedMatching
  }

  return hasCuratedMatchingEntitlement({
    role: viewer.role,
    billing: profile.membership_billing,
    applicationApproved: true,
  })
}

export function friendshipContextForViewer(
  viewer: Viewer,
  entitlements: MemberEntitlements | null,
  questionnaire: FriendshipQuestionnaireRow | null,
  identity?: MatchingIdentityPresentation | null
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
    entitlementInput: {
      ...entitlementInput,
      acceptedIdentity: identity?.status ?? 'unavailable',
    },
    questionnaire,
    acceptedIdentity: identity?.status ?? 'unavailable',
    stripeStatus: identity?.stripeStatus ?? null,
    messagingSuspended: isMessagingSuspended(viewer.profile),
  })

  return {
    friendsIntent,
    access,
    canAccessFriendsNav: access.canViewMatches,
  }
}
