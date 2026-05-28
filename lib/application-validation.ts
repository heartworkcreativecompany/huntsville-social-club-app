import {
  INTEREST_MAX,
  INTEREST_MIN,
  PHOTO_MAX_COUNT,
  PHOTO_MIN_COUNT,
  PROMPT_MAX_CHARS,
  PROMPT_MIN_REQUIRED,
} from '@/lib/application-form-content'
import type { ApplicationDraft } from '@/lib/application'

export function completedPromptCount(draft: ApplicationDraft): number {
  return [
    draft.prompts.perfectWeekend,
    draft.prompts.hopingToMeet,
    draft.prompts.intoLately,
    draft.prompts.valueInCommunity,
  ].filter((value) => value.trim().length > 0).length
}

function promptTooLong(draft: ApplicationDraft): string | null {
  const entries = [
    ['A perfect weekend', draft.prompts.perfectWeekend],
    ['Hoping to meet', draft.prompts.hopingToMeet],
    ['Into lately', draft.prompts.intoLately],
    ['Values in community', draft.prompts.valueInCommunity],
  ] as const

  for (const [label, value] of entries) {
    if (value.trim().length > PROMPT_MAX_CHARS) {
      return `${label} must be ${PROMPT_MAX_CHARS} characters or fewer.`
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

  if (!workAndInterests.occupation.trim()) {
    return 'Please enter your occupation.'
  }
  if (workAndInterests.interests.length < INTEREST_MIN) {
    return `Please select at least ${INTEREST_MIN} interests.`
  }
  if (workAndInterests.interests.length > INTEREST_MAX) {
    return `Please select no more than ${INTEREST_MAX} interests.`
  }

  const promptError = promptTooLong(draft)
  if (promptError) return promptError

  if (completedPromptCount(draft) < PROMPT_MIN_REQUIRED) {
    return `Please complete at least ${PROMPT_MIN_REQUIRED} short prompts.`
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
