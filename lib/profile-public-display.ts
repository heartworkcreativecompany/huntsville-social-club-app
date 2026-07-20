import type { ApplicationDraft } from '@/lib/application'
import { APPLICATION_PROMPTS } from '@/lib/application-form-content'
import {
  CONNECTION_TYPES_OPEN_TO_FIELD,
  memberPublicIntentLabelsFromValues,
} from '@/lib/member-public-intent'
import { connectionIntentsFromDraft } from '@/lib/application-draft-sync'

/** Prompt keys rendered elsewhere — do not repeat under generic prompt list. */
const PROMPT_KEYS_EXCLUDED_FROM_PUBLIC_LIST = new Set([
  'bringsYouHere',
  'hopingToMeet',
])

function normalizeForCompare(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * Public profile details with deduplicated sections.
 * - About = hopingToMeet only (profile bio)
 * - Connection intents = canonical filters/badges source
 * - Connection types open to = display-only detail
 */
export function publicProfileDetailsFromDraft(
  draft: ApplicationDraft,
  options?: { connectionsOpenTo?: string[] | null }
): ApplicationPublicProfileDetails {
  const bio = draft.prompts.hopingToMeet.trim() || null
  const normalizedBio = bio ? normalizeForCompare(bio) : null

  const connectionIntents = memberPublicIntentLabelsFromValues(
    connectionIntentsFromDraft(draft)
  )

  const connectionsOpenTo = [
    ...(options?.connectionsOpenTo ?? draft.profile.connectionsOpenTo),
  ]

  const usedValues = new Set<string>()
  if (normalizedBio) usedValues.add(normalizedBio)
  for (const label of connectionIntents) {
    usedValues.add(normalizeForCompare(label))
  }
  for (const label of connectionsOpenTo) {
    usedValues.add(normalizeForCompare(label))
  }

  const prompts = APPLICATION_PROMPTS.filter(
    (prompt) => !PROMPT_KEYS_EXCLUDED_FROM_PUBLIC_LIST.has(prompt.key)
  )
    .map((prompt) => ({
      label: prompt.label,
      value: draft.prompts[prompt.key]?.trim() ?? '',
    }))
    .filter((prompt) => {
      if (!prompt.value) return false
      const normalized = normalizeForCompare(prompt.value)
      if (usedValues.has(normalized)) return false
      usedValues.add(normalized)
      return true
    })

  const socialVibe =
    draft.workAndInterests.socialVibe.trim() ||
    (draft.workAndInterests.eventInterests.length > 0
      ? draft.workAndInterests.eventInterests.slice(0, 3).join(', ')
      : null)

  return {
    displayName: draft.profile.displayName.trim() || null,
    connectionIntents,
    locationArea: draft.location.neighborhoodOrArea.trim() || null,
    occupation: draft.workAndInterests.occupation.trim() || null,
    industry: draft.workAndInterests.industry.trim() || null,
    interests: draft.workAndInterests.interests,
    lifestyleTags: draft.workAndInterests.lifestyleTags,
    eventInterests: draft.workAndInterests.eventInterests,
    connectionsOpenTo,
    socialVibe,
    about: bio,
    prompts,
  }
}
