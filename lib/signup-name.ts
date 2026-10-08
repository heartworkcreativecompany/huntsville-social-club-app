/**
 * Signup given and family names.
 *
 * These are the names collected at account creation. They are not the public
 * display name stored in profiles.full_name. A single name uses given name
 * only; family name may be blank. Existing accounts can have both null.
 */

export const SIGNUP_NAME_MAX_LENGTH = 80

export const SIGNUP_GIVEN_NAME_METADATA_KEY = 'given_name' as const

export const SIGNUP_FAMILY_NAME_METADATA_KEY = 'family_name' as const

export const SIGNUP_GIVEN_NAME_REQUIRED_MESSAGE = 'Enter your first name.'

export const SIGNUP_NAME_TOO_LONG_MESSAGE = 'Use 80 characters or fewer.'

export const SIGNUP_NAME_HIDDEN_CHARACTER_MESSAGE =
  'Remove hidden characters from your name.'

const HIDDEN_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/

export type SignupNameMetadata = {
  given_name: string
  family_name: string
}

/** Collapse whitespace. Does not restrict letters, marks, apostrophes, or hyphens. */
export function normalizeSignupName(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function signupNameError(value: string, required: boolean): string | null {
  if (HIDDEN_CHARACTER.test(value)) return SIGNUP_NAME_HIDDEN_CHARACTER_MESSAGE
  const normalized = normalizeSignupName(value)
  if (!normalized) return required ? SIGNUP_GIVEN_NAME_REQUIRED_MESSAGE : null
  if (normalized.length > SIGNUP_NAME_MAX_LENGTH) return SIGNUP_NAME_TOO_LONG_MESSAGE
  return null
}

/** Both strings, already normalized. A blank family name is a single-name signup. */
export function signupNameMetadata(input: {
  givenName: string
  familyName: string
}): SignupNameMetadata {
  return {
    given_name: normalizeSignupName(input.givenName),
    family_name: normalizeSignupName(input.familyName),
  }
}
