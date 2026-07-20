import {
  buildMemberEntitlements,
  canUseMessaging,
  type EntitlementCycle,
} from '@/lib/membership-entitlements'
import type { CompatibilityProfileFields } from '@/lib/compatibility/types'
import { includesDatingIntent } from '@/lib/member-public-intent'
import { isCompatibilityQuestionnaireEffectivelyComplete } from '@/lib/compatibility/questionnaire'

/** Central feature flag — when false, all compatibility flows are disabled. */
export function isCompatibilityFeatureEnabled(): boolean {
  return process.env.COMPATIBILITY_MATCHING_ENABLED === 'true'
}

export function isDatingConnectionSelected(
  connectionIntents: string[] | null | undefined
): boolean {
  return includesDatingIntent(connectionIntents)
}

export function isApprovedMember(applicationStatus: string | null | undefined): boolean {
  return applicationStatus === 'approved'
}

export type MessagingEntitlementInput = {
  role?: string | null
  billing?: unknown
  applicationApproved?: boolean
  activeCycle?: EntitlementCycle | null
}

export function hasMessagingEntitlement(input: MessagingEntitlementInput): boolean {
  const entitlements = buildMemberEntitlements({
    role: input.role,
    billing: input.billing,
    applicationApproved: input.applicationApproved ?? true,
    activeCycle: input.activeCycle ?? null,
  })
  return canUseMessaging(entitlements)
}

export function isUserPaused(profile: CompatibilityProfileFields): boolean {
  if (profile.wants_curated_matches === false) {
    return true
  }
  return profile.curated_matches_paused_at != null
}

export function isCompatibilityEligible(
  profile: CompatibilityProfileFields,
  entitlementInput: MessagingEntitlementInput
): boolean {
  if (!isCompatibilityFeatureEnabled()) {
    return false
  }

  if (!isApprovedMember(profile.application_status)) {
    return false
  }

  if (!isDatingConnectionSelected(profile.connection_intents)) {
    return false
  }

  if (!hasMessagingEntitlement(entitlementInput)) {
    return false
  }

  if (profile.wants_curated_matches === false) {
    return false
  }

  return true
}

export function canGenerateMatches(
  profile: CompatibilityProfileFields,
  entitlementInput: MessagingEntitlementInput
): boolean {
  if (!isCompatibilityFeatureEnabled()) {
    return false
  }

  if (!isCompatibilityEligible(profile, entitlementInput)) {
    return false
  }

  if (profile.compatibility_completed_at == null) {
    return false
  }

  if (
    !isCompatibilityQuestionnaireEffectivelyComplete({
      compatibility_questionnaire: profile.compatibility_questionnaire,
      compatibility_completed_at: profile.compatibility_completed_at,
    })
  ) {
    return false
  }

  if (isUserPaused(profile)) {
    return false
  }

  return true
}
