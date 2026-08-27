import {
  APPLICATION_PROMPTS,
  INTEREST_MAX,
  INTEREST_MIN,
  PHOTO_MAX_COUNT,
  PHOTO_MIN_COUNT,
  PROMPT_MAX_CHARS,
  REQUIRED_PROMPT_KEYS,
  applicationGoBackToStepPrefix,
  applicationStepHeadingId,
} from '@/lib/application-form-content'
import type { ApplicationDraft } from '@/lib/application'
import { parseIndustryValue } from '@/lib/industries'
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

export const APPLICATION_FIELD_IDS = {
  firstName: 'application-field-first-name',
  lastName: 'application-field-last-name',
  displayName: 'application-field-display-name',
  dateOfBirth: 'application-field-dob',
  connectionIntents: 'application-field-connection-intents',
  city: 'application-field-city',
  neighborhood: 'application-field-neighborhood',
  metro: 'application-field-metro',
  localConnection: 'application-field-local-connection',
  industry: 'application-field-industry',
  interests: 'application-field-interests',
  aboutMe: 'application-field-about-me',
  prompts: 'application-field-prompts',
  photos: 'application-field-photos',
  agreements: 'application-field-agreements',
} as const

export type ApplicationIssueCode =
  | 'first_name'
  | 'last_name'
  | 'display_name'
  | 'date_of_birth'
  | 'connection_intents'
  | 'city_state_zip'
  | 'neighborhood'
  | 'lives_in_huntsville'
  | 'local_connection'
  | 'industry'
  | 'interests_min'
  | 'interests_max'
  | 'about_me'
  | 'about_me_length'
  | 'prompt_length'
  | 'required_prompts'
  | 'photos_min'
  | 'photos_max'
  | 'primary_photo'
  | 'primary_photo_headshot'
  | 'agreements'

export type ApplicationValidationIssue = {
  code: ApplicationIssueCode
  stepId: number
  focusId: string
  /** Full user-facing message, including the Go-back-to-step prefix. */
  message: string
}

const ISSUE_STEP: Record<ApplicationIssueCode, number> = {
  first_name: 1,
  last_name: 1,
  display_name: 1,
  date_of_birth: 1,
  connection_intents: 1,
  city_state_zip: 2,
  neighborhood: 2,
  lives_in_huntsville: 2,
  local_connection: 2,
  industry: 3,
  interests_min: 3,
  interests_max: 3,
  about_me: 4,
  about_me_length: 4,
  prompt_length: 4,
  required_prompts: 4,
  photos_min: 5,
  photos_max: 5,
  primary_photo: 5,
  primary_photo_headshot: 5,
  agreements: 6,
}

const ISSUE_FOCUS_ID: Record<ApplicationIssueCode, string> = {
  first_name: APPLICATION_FIELD_IDS.firstName,
  last_name: APPLICATION_FIELD_IDS.lastName,
  display_name: APPLICATION_FIELD_IDS.displayName,
  date_of_birth: APPLICATION_FIELD_IDS.dateOfBirth,
  connection_intents: APPLICATION_FIELD_IDS.connectionIntents,
  city_state_zip: APPLICATION_FIELD_IDS.city,
  neighborhood: APPLICATION_FIELD_IDS.neighborhood,
  lives_in_huntsville: APPLICATION_FIELD_IDS.metro,
  local_connection: APPLICATION_FIELD_IDS.localConnection,
  industry: APPLICATION_FIELD_IDS.industry,
  interests_min: APPLICATION_FIELD_IDS.interests,
  interests_max: APPLICATION_FIELD_IDS.interests,
  about_me: APPLICATION_FIELD_IDS.aboutMe,
  about_me_length: APPLICATION_FIELD_IDS.aboutMe,
  prompt_length: APPLICATION_FIELD_IDS.prompts,
  required_prompts: APPLICATION_FIELD_IDS.prompts,
  photos_min: APPLICATION_FIELD_IDS.photos,
  photos_max: APPLICATION_FIELD_IDS.photos,
  primary_photo: APPLICATION_FIELD_IDS.photos,
  primary_photo_headshot: APPLICATION_FIELD_IDS.photos,
  agreements: APPLICATION_FIELD_IDS.agreements,
}

function issueMessage(code: ApplicationIssueCode, remainder: string): string {
  const stepId = ISSUE_STEP[code]
  return `${applicationGoBackToStepPrefix(stepId)} and ${remainder}`
}

function issue(
  code: ApplicationIssueCode,
  remainder: string
): ApplicationValidationIssue {
  const stepId = ISSUE_STEP[code]
  return {
    code,
    stepId,
    focusId: ISSUE_FOCUS_ID[code] || applicationStepHeadingId(stepId),
    message: issueMessage(code, remainder),
  }
}

function promptTooLongIssue(
  draft: ApplicationDraft
): ApplicationValidationIssue | null {
  for (const prompt of APPLICATION_PROMPTS) {
    const value = draft.prompts[prompt.key] ?? ''
    if (value.trim().length > PROMPT_MAX_CHARS) {
      return issue(
        'prompt_length',
        `complete “${prompt.label}” in ${PROMPT_MAX_CHARS} characters or fewer.`
      )
    }
  }
  return null
}

export function collectApplicationValidationIssues(
  draft: ApplicationDraft
): ApplicationValidationIssue[] {
  const { profile, location, workAndInterests, photos, agreements } = draft
  const issues: ApplicationValidationIssue[] = []

  if (!profile.firstName.trim()) {
    issues.push(issue('first_name', 'enter your first name.'))
  }
  if (!profile.lastName.trim()) {
    issues.push(issue('last_name', 'enter your last name.'))
  }
  if (!profile.displayName.trim()) {
    issues.push(issue('display_name', 'enter a display name.'))
  }
  if (!profile.dateOfBirth.trim()) {
    issues.push(issue('date_of_birth', 'enter your date of birth.'))
  }

  if (profile.connectionIntents.length < 1) {
    issues.push(
      issue(
        'connection_intents',
        'select at least one kind of connection you are looking for.'
      )
    )
  } else {
    const validIntents = parseConnectionIntents(profile.connectionIntents)
    if (validIntents.length < 1) {
      issues.push(
        issue(
          'connection_intents',
          'select at least one kind of connection you are looking for.'
        )
      )
    }
  }

  if (
    !location.city.trim() ||
    !location.state.trim() ||
    !location.zipCode.trim()
  ) {
    issues.push(
      issue('city_state_zip', 'complete your city, state, and ZIP code.')
    )
  }
  if (!location.neighborhoodOrArea.trim()) {
    issues.push(
      issue('neighborhood', 'add a public neighborhood or area label.')
    )
  }
  if (location.livesInHuntsvilleArea === null) {
    issues.push(
      issue(
        'lives_in_huntsville',
        'indicate whether you live in the Huntsville area.'
      )
    )
  }
  if (
    location.livesInHuntsvilleArea === false &&
    !location.localConnection.trim()
  ) {
    issues.push(
      issue(
        'local_connection',
        'describe your connection to the Huntsville area.'
      )
    )
  }

  if (!parseIndustryValue(workAndInterests.industry)) {
    issues.push(issue('industry', 'select an industry.'))
  }

  if (workAndInterests.interests.length < INTEREST_MIN) {
    issues.push(
      issue('interests_min', `select at least ${INTEREST_MIN} interests.`)
    )
  }
  if (workAndInterests.interests.length > INTEREST_MAX) {
    issues.push(
      issue(
        'interests_max',
        `select no more than ${INTEREST_MAX} interests.`
      )
    )
  }

  if (!draft.profile.aboutMe.trim()) {
    issues.push(issue('about_me', 'complete your About Me.'))
  }
  if (draft.profile.aboutMe.trim().length > PROMPT_MAX_CHARS) {
    issues.push(
      issue(
        'about_me_length',
        `complete About Me in ${PROMPT_MAX_CHARS} characters or fewer.`
      )
    )
  }

  const promptIssue = promptTooLongIssue(draft)
  if (promptIssue) issues.push(promptIssue)

  if (!requiredPromptsComplete(draft)) {
    issues.push(
      issue('required_prompts', 'complete the required about-you prompts.')
    )
  }

  if (photos.length < PHOTO_MIN_COUNT) {
    issues.push(
      issue('photos_min', `upload at least ${PHOTO_MIN_COUNT} photos.`)
    )
  }
  if (photos.length > PHOTO_MAX_COUNT) {
    issues.push(
      issue('photos_max', `upload no more than ${PHOTO_MAX_COUNT} photos.`)
    )
  }

  const primary = photos.find((photo) => photo.isPrimary)
  if (!primary) {
    issues.push(issue('primary_photo', 'choose a primary photo.'))
  } else if (!primary.facePhotoConfirmed) {
    issues.push(
      issue(
        'primary_photo_headshot',
        'verify that your primary photo is a clear headshot.'
      )
    )
  }

  if (
    !agreements.codeOfConduct ||
    !agreements.informationAccurate ||
    !agreements.approvalRequired ||
    !agreements.verificationConsent
  ) {
    issues.push(
      issue(
        'agreements',
        'accept all required agreements before submitting.'
      )
    )
  }

  return issues
}

export function validateApplicationStep(
  draft: ApplicationDraft,
  stepId: number
): ApplicationValidationIssue[] {
  return collectApplicationValidationIssues(draft).filter(
    (item) => item.stepId === stepId
  )
}

export function validateApplicationForSubmit(
  draft: ApplicationDraft
): string | null {
  return collectApplicationValidationIssues(draft)[0]?.message ?? null
}
