import {
  emptyDraft,
  parseApplicationDraft,
  type ApplicationDraft,
} from '@/lib/application'
import { completedPromptCount } from '@/lib/application-validation'
import { DATING_CONNECTION_OPTION, type DatingConnectionChange } from '@/lib/compatibility/types'
import { discoveryColumnsFromDraft } from '@/lib/membership-systems'

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

export function connectionsOpenToFromDraft(draft: ApplicationDraft): string[] {
  return [...draft.profile.connectionsOpenTo]
}

export function detectDatingConnectionChange(
  previous: string[],
  next: string[]
): DatingConnectionChange {
  const hadDating = previous.includes(DATING_CONNECTION_OPTION)
  const hasDating = next.includes(DATING_CONNECTION_OPTION)

  if (!hadDating && hasDating) return { type: 'added' }
  if (hadDating && !hasDating) return { type: 'removed' }
  return { type: 'none' }
}

export function profileColumnsFromDraft(draft: ApplicationDraft) {
  const discovery = discoveryColumnsFromDraft(draft)
  return {
    full_name: draft.profile.displayName.trim() || null,
    location_area: draft.location.neighborhoodOrArea.trim() || null,
    membership_intent: membershipIntentFromDraft(draft) || null,
    referral_source: null,
    application_draft: draft,
    connections_open_to: connectionsOpenToFromDraft(draft),
    discovery_intent: discovery.discovery_intent,
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

  if (!parsed.prompts.bringsYouHere.trim() && profile.membership_intent?.trim()) {
    parsed.prompts.bringsYouHere = profile.membership_intent.trim()
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
