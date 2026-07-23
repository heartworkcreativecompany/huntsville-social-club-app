import type { ApplicationDraft } from '@/lib/application'
import { APPLICATION_PROMPTS } from '@/lib/application-form-content'
import { memberPublicIntentLabelsFromValues } from '@/lib/member-public-intent'
import { connectionIntentsFromDraft } from '@/lib/application-draft-sync'

export type ProfilePromptDisplay = {
  label: string
  value: string
}

export type ApplicationPublicProfileDetails = {
  displayName: string | null
  connectionIntents: string[]
  locationArea: string | null
  occupation: string | null
  industry: string | null
  interests: string[]
  lifestyleTags: string[]
  eventInterests: string[]
  connectionsOpenTo: string[]
  socialVibe: string | null
  about: string | null
  prompts: ProfilePromptDisplay[]
}

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
 * About Me (`profile.aboutMe`) is the only main bio source.
 */
export function publicProfileDetailsFromDraft(
  draft: ApplicationDraft,
  options?: { connectionsOpenTo?: string[] | null }
): ApplicationPublicProfileDetails {
  const bio = draft.profile.aboutMe.trim() || null
  const normalizedBio = bio ? normalizeForCompare(bio) : null

  const connectionIntents = memberPublicIntentLabelsFromValues(
    connectionIntentsFromDraft(draft)
  )

  const usedValues = new Set<string>()
  if (normalizedBio) usedValues.add(normalizedBio)
  for (const label of connectionIntents) {
    usedValues.add(normalizeForCompare(label))
  }

  // Keep connection-type detail only when it adds unique labels beyond intents.
  const connectionsOpenTo = [
    ...(options?.connectionsOpenTo ?? draft.profile.connectionsOpenTo),
  ].filter((label) => {
    const normalized = normalizeForCompare(label)
    if (!normalized || usedValues.has(normalized)) return false
    usedValues.add(normalized)
    return true
  })

  const interests = draft.workAndInterests.interests.filter((label) => {
    const normalized = normalizeForCompare(label)
    if (!normalized || usedValues.has(normalized)) return false
    usedValues.add(normalized)
    return true
  })

  const lifestyleTags = draft.workAndInterests.lifestyleTags.filter((label) => {
    const normalized = normalizeForCompare(label)
    if (!normalized || usedValues.has(normalized)) return false
    usedValues.add(normalized)
    return true
  })

  const eventInterests = draft.workAndInterests.eventInterests.filter(
    (label) => {
      const normalized = normalizeForCompare(label)
      if (!normalized || usedValues.has(normalized)) return false
      usedValues.add(normalized)
      return true
    }
  )

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

  const socialVibeRaw = draft.workAndInterests.socialVibe.trim()
  const socialVibe =
    socialVibeRaw && !usedValues.has(normalizeForCompare(socialVibeRaw))
      ? socialVibeRaw
      : null
  if (socialVibe) usedValues.add(normalizeForCompare(socialVibe))

  return {
    displayName: draft.profile.displayName.trim() || null,
    connectionIntents,
    locationArea: draft.location.neighborhoodOrArea.trim() || null,
    occupation: draft.workAndInterests.occupation.trim() || null,
    industry: draft.workAndInterests.industry.trim() || null,
    interests,
    lifestyleTags,
    eventInterests,
    connectionsOpenTo,
    socialVibe,
    about: bio,
    prompts,
  }
}
