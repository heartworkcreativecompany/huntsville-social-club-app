import {
  emptyDraft,
  parseApplicationDraft,
  type ApplicationDraft,
} from '@/lib/application'
import { completedPromptCount } from '@/lib/application-validation'
import {
  discoveryIntentFromMemberIntents,
  memberPublicIntentLabelsFromValues,
  memberPublicIntentsFromConnectionIntents,
  memberPublicIntentsFromConnectionsOpenTo,
  parseConnectionIntents,
  resolveMemberPublicIntents,
  sanitizeConnectionsOpenToForStorage,
  type MemberPublicIntentValue,
} from '@/lib/member-public-intent'
import {
  discoveryColumnsFromDraft,
  normalizeDiscoveryIntent,
} from '@/lib/membership-systems'

/** Short public summary for member cards — not a dump of all prompts. */
export function membershipIntentFromDraft(draft: ApplicationDraft): string {
  const parts = [
    draft.prompts.bringsYouHere,
    draft.prompts.hopingToMeet,
  ]
    .map((s) => s.trim())
    .filter(Boolean)

  if (parts.length > 0) {
    return parts.join(' · ')
  }

  const interests = draft.workAndInterests.interests
  if (interests.length > 0) {
    return `Interested in ${interests.slice(0, 3).join(', ')}`
  }

  return draft.profile.displayName.trim()
    ? `Member in ${draft.location.neighborhoodOrArea.trim() || 'Huntsville area'}`
    : ''
}

export function connectionIntentsFromDraft(
  draft: ApplicationDraft
): MemberPublicIntentValue[] {
  if (draft.profile.connectionIntents.length > 0) {
    return draft.profile.connectionIntents
  }
  if (draft.profile.lookingFor.trim()) {
    const normalized = normalizeDiscoveryIntent(draft.profile.lookingFor)
    if (
      normalized === 'networking' ||
      normalized === 'dating' ||
      normalized === 'friends'
    ) {
      return [normalized]
    }
    if (normalized === 'mixed') {
      return memberPublicIntentsFromConnectionsOpenTo(
        draft.profile.connectionsOpenTo
      )
    }
  }
  return memberPublicIntentsFromConnectionsOpenTo(draft.profile.connectionsOpenTo)
}

export function connectionsOpenToFromDraft(draft: ApplicationDraft): string[] {
  return sanitizeConnectionsOpenToForStorage(
    [...draft.profile.connectionsOpenTo],
    connectionIntentsFromDraft(draft)
  )
}

export function detectDatingConnectionChange(
  previous: string[] | null | undefined,
  next: string[] | null | undefined
): import('@/lib/compatibility/types').DatingConnectionChange {
  const hadDating = memberPublicIntentsFromConnectionIntents(previous).includes(
    'dating'
  )
  const hasDating = memberPublicIntentsFromConnectionIntents(next).includes(
    'dating'
  )

  if (!hadDating && hasDating) return { type: 'added' }
  if (hadDating && !hasDating) return { type: 'removed' }
  return { type: 'none' }
}

export function memberIntentColumns(intents: MemberPublicIntentValue[]) {
  return {
    connection_intents: intents,
    discovery_intent: discoveryIntentFromMemberIntents(intents),
  }
}

export function profileColumnsFromDraft(draft: ApplicationDraft) {
  const discovery = discoveryColumnsFromDraft(draft)
  const connectionIntents = connectionIntentsFromDraft(draft)
  return {
    full_name: draft.profile.displayName.trim() || null,
    location_area: draft.location.neighborhoodOrArea.trim() || null,
    membership_intent: membershipIntentFromDraft(draft) || null,
    referral_source: null,
    application_draft: {
      ...draft,
      profile: {
        ...draft.profile,
        connectionIntents,
        connectionsOpenTo: connectionsOpenToFromDraft(draft),
      },
    },
    connection_intents: connectionIntents,
    connections_open_to: connectionsOpenToFromDraft(draft),
    discovery_intent:
      discoveryIntentFromMemberIntents(connectionIntents) ||
      discovery.discovery_intent,
    location_city: discovery.location_city,
    location_zip: discovery.location_zip,
    birth_year: discovery.birth_year,
    discovery_interests: discovery.discovery_interests,
    discovery_industry: discovery.discovery_industry,
    locality_confirmation: discovery.locality_confirmation,
  }
}

export function mergeProfileIntoDraft(
  profile: {
    full_name: string | null
    membership_intent: string | null
    location_area: string | null
    application_draft: unknown
    connections_open_to?: string[] | null
    connection_intents?: string[] | null
    discovery_intent?: string | null
  } | null
): ApplicationDraft {
  if (!profile) return emptyDraft()

  const parsed = profile.application_draft
    ? parseApplicationDraft(profile.application_draft)
    : emptyDraft()

  if (!parsed.profile.displayName.trim() && profile.full_name?.trim()) {
    parsed.profile.displayName = profile.full_name.trim()
    const parts = profile.full_name.trim().split(/\s+/)
    if (!parsed.profile.firstName.trim()) {
      parsed.profile.firstName = parts[0] ?? ''
      parsed.profile.lastName = parts.slice(1).join(' ')
    }
  }

  if (
    !parsed.location.neighborhoodOrArea.trim() &&
    profile.location_area?.trim()
  ) {
    parsed.location.neighborhoodOrArea = profile.location_area.trim()
  }

  if (!parsed.prompts.hopingToMeet.trim() && profile.membership_intent?.trim()) {
    parsed.prompts.hopingToMeet = profile.membership_intent.trim()
  }

  const resolvedIntents = profile
    ? resolveMemberPublicIntents(profile)
    : []
  if (resolvedIntents.length > 0) {
    parsed.profile.connectionIntents = resolvedIntents
  }

  if (
    parsed.profile.connectionsOpenTo.length === 0 &&
    profile?.connections_open_to &&
    profile.connections_open_to.length > 0
  ) {
    parsed.profile.connectionsOpenTo = sanitizeConnectionsOpenToForStorage(
      profile.connections_open_to,
      resolvedIntents
    )
  } else if (parsed.profile.connectionsOpenTo.length > 0) {
    parsed.profile.connectionsOpenTo = sanitizeConnectionsOpenToForStorage(
      parsed.profile.connectionsOpenTo,
      parsed.profile.connectionIntents
    )
  }

  return parsed
}

export function draftCompletionSummary(draft: ApplicationDraft) {
  return {
    promptsCompleted: completedPromptCount(draft),
    photoCount: draft.photos.length,
    interestsSelected: draft.workAndInterests.interests.length,
  }
}
