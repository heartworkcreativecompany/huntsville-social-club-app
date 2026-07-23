import {
  INTEREST_MAX,
  INTEREST_MIN,
  PHOTO_MAX_COUNT,
  PHOTO_MIN_COUNT,
  PROMPT_MAX_CHARS,
  REQUIRED_PROMPT_KEYS,
  APPLICATION_PROMPTS,
} from '@/lib/application-form-content'
import type { ApplicationDraft } from '@/lib/application'
import { parseConnectionIntents } from '@/lib/member-public-intent'

export function completedPromptCount(draft: ApplicationDraft): number {
  return APPLICATION_PROMPTS.filter((p) =>
    draft.prompts[p.key]?.trim()
  ).length
}

export function requiredPromptsComplete(draft: ApplicationDraft): boolean {
  return REQUIRED_PROMPT_KEYS.every((key) =>
    Boolean(draft.prompts[key]?.trim())
  )
}

function promptTooLong(draft: ApplicationDraft): string | null {
  for (const prompt of APPLICATION_PROMPTS) {
    const value = draft.prompts[prompt.key] ?? ''
    if (value.trim().length > PROMPT_MAX_CHARS) {
      return `${prompt.label} must be ${PROMPT_MAX_CHARS} characters or fewer.`
    }
  }
  return null
}

export function validateApplicationForSubmit(
  draft: ApplicationDraft
): string | null {
  const { profile, location, workAndInterests, photos, agreements } = draft

  if (!profile.firstName.trim()) {
    return 'Please enter your first name.'
  }
  if (!profile.lastName.trim()) {
    return 'Please enter your last name.'
  }
  if (!profile.displayName.trim()) {
    return 'Please enter a display name.'
  }
  if (!profile.dateOfBirth.trim()) {
    return 'Please enter your date of birth.'
  }

  if (profile.connectionIntents.length < 1) {
    return 'Select at least one kind of connection you are looking for.'
  }
  const validIntents = parseConnectionIntents(profile.connectionIntents)
  if (validIntents.length < 1) {
    return 'Select at least one kind of connection you are looking for.'
  }

  if (!location.city.trim() || !location.state.trim() || !location.zipCode.trim()) {
    return 'Please complete your city, state, and ZIP code.'
  }
  if (!location.neighborhoodOrArea.trim()) {
    return 'Please add a public neighborhood or area label.'
  }
  if (location.livesInHuntsvilleArea === null) {
    return 'Please indicate whether you live in the Huntsville area.'
  }
  if (
    location.livesInHuntsvilleArea === false &&
    !location.localConnection.trim()
  ) {
    return 'Please describe your connection to the Huntsville area.'
  }

  if (workAndInterests.interests.length < INTEREST_MIN) {
    return `Please select at least ${INTEREST_MIN} interests.`
  }
  if (workAndInterests.interests.length > INTEREST_MAX) {
    return `Please select no more than ${INTEREST_MAX} interests.`
  }

  if (!draft.profile.aboutMe.trim()) {
    return 'Please complete your About Me.'
  }
  if (draft.profile.aboutMe.trim().length > PROMPT_MAX_CHARS) {
    return `About Me must be ${PROMPT_MAX_CHARS} characters or fewer.`
  }

  const promptError = promptTooLong(draft)
  if (promptError) return promptError

  if (!requiredPromptsComplete(draft)) {
    return 'Please complete the required about-you prompts.'
  }

  if (photos.length < PHOTO_MIN_COUNT) {
    return `Please upload at least ${PHOTO_MIN_COUNT} photos.`
  }
  if (photos.length > PHOTO_MAX_COUNT) {
    return `Please upload no more than ${PHOTO_MAX_COUNT} photos.`
  }

  const primary = photos.find((photo) => photo.isPrimary)
  if (!primary) {
    return 'Please choose a primary photo.'
  }
  if (!primary.facePhotoConfirmed) {
    return 'Please confirm your primary photo is a clear face photo.'
  }

  if (
    !agreements.codeOfConduct ||
    !agreements.informationAccurate ||
    !agreements.approvalRequired ||
    !agreements.verificationConsent
  ) {
    return 'Please accept all required agreements before submitting.'
  }

  return null
}
