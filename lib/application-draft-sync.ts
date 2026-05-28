import {
  emptyDraft,
  parseApplicationDraft,
  type ApplicationDraft,
} from '@/lib/application'
import { completedPromptCount } from '@/lib/application-validation'

/** Public-facing summary from prompts (never includes private location). */
export function membershipIntentFromDraft(draft: ApplicationDraft): string {
  const parts = [
    draft.prompts.perfectWeekend,
    draft.prompts.hopingToMeet,
    draft.prompts.intoLately,
    draft.prompts.valueInCommunity,
  ]
    .map((s) => s.trim())
    .filter(Boolean)

  if (parts.length > 0) {
    return parts.slice(0, 2).join(' · ')
  }

  const interests = draft.workAndInterests.interests
  if (interests.length > 0) {
    return `Interested in ${interests.slice(0, 3).join(', ')}`
  }

  return draft.profile.displayName.trim()
    ? `Application from ${draft.profile.displayName.trim()}`
    : ''
}

export function profileColumnsFromDraft(draft: ApplicationDraft) {
  return {
    full_name: draft.profile.displayName.trim() || null,
    location_area: draft.location.neighborhoodOrArea.trim() || null,
    membership_intent: membershipIntentFromDraft(draft) || null,
    referral_source: null,
    application_draft: draft,
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

  return parsed
}

export function draftCompletionSummary(draft: ApplicationDraft) {
  return {
    promptsCompleted: completedPromptCount(draft),
    photoCount: draft.photos.length,
    interestsSelected: draft.workAndInterests.interests.length,
  }
}
