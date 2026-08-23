import { compatibilityEntitlementInputFromViewer } from '@/lib/compatibility/viewer-context'
import { evaluateFriendshipAccess } from '@/lib/friendship/eligibility'
import { includesFriendsIntent } from '@/lib/member-public-intent'
import type { FriendshipQuestionnaireRow } from '@/lib/friendship/types'
import type { MemberEntitlements } from '@/lib/membership-entitlements'
import type { Viewer } from '@/lib/viewer'

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
