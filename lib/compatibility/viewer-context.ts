import {
  isCompatibilityFeatureEnabled,
  type MessagingEntitlementInput,
} from '@/lib/compatibility/eligibility'
import { canAccessMatchesInbox } from '@/lib/compatibility/matches-access'
import { summarizeCompatibilityProfileStatus } from '@/lib/compatibility/profile-status'
import type { CompatibilityProfileFields } from '@/lib/compatibility/types'
import type { CuratedMatchPauseReason } from '@/lib/compatibility/types'
import type { MemberEntitlements } from '@/lib/membership-entitlements'
import type { Viewer } from '@/lib/viewer'

export function compatibilityProfileFieldsFromViewer(
  viewer: Viewer
): CompatibilityProfileFields & { compatibility_questionnaire?: unknown } {
  const profile = viewer.profile
  return {
    application_status: profile?.application_status ?? null,
    connection_intents: profile?.connection_intents ?? null,
    connections_open_to: profile?.connections_open_to ?? null,
    compatibility_completed_at: profile?.compatibility_completed_at ?? null,
    compatibility_questionnaire: profile?.compatibility_questionnaire,
    wants_curated_matches: profile?.wants_curated_matches ?? null,
    curated_matches_paused_at: profile?.curated_matches_paused_at ?? null,
    curated_matches_pause_reason:
      (profile?.curated_matches_pause_reason as CuratedMatchPauseReason | null) ??
      null,
    dating_connection_enabled_at: null,
    dating_connection_removed_at: null,
    messaging_entitlement_lost_at: null,
    messaging_entitlement_restored_at: null,
    role: viewer.role,
    membership_billing: profile?.membership_billing,
  }
}

export function compatibilityEntitlementInputFromViewer(
  viewer: Viewer,
  entitlements: MemberEntitlements | null
): MessagingEntitlementInput {
  return {
    role: viewer.role,
    billing: viewer.profile?.membership_billing,
    applicationApproved: viewer.canAccessApp,
    activeCycle: entitlements?.activeCycle ?? null,
    accessOverride: entitlements?.accessOverride ?? null,
  }
}

export function compatibilityContextForViewer(
  viewer: Viewer,
  entitlements: MemberEntitlements | null
) {
  const featureEnabled = isCompatibilityFeatureEnabled()
  const profile = compatibilityProfileFieldsFromViewer(viewer)
  const entitlementInput = compatibilityEntitlementInputFromViewer(
    viewer,
    entitlements
  )
  const summary = summarizeCompatibilityProfileStatus({
    profile,
    entitlementInput,
  })

  return {
    featureEnabled,
    canAccessMatchesInbox: canAccessMatchesInbox(summary),
    summary,
    canMessage: entitlements?.canMessage ?? false,
  }
}
