import { validatePasswordConfirmation } from '@/lib/auth-validation'

/**
 * Password rules for choosing a new password.
 *
 * Confirmed from this repository and the reported Auth rejection:
 * - The application validator requires at least 8 characters. The committed
 *   Auth template minimum is 6, so 8 is the stricter rule members already hit.
 * - A letter-and-number password was rejected because a special character was
 *   also required.
 *
 * Uppercase, lowercase, and digits are not separate checklist rules because
 * this repository does not confirm them. Auth remains the final check.
 * A special character here means any character that is not a letter or digit.
 * The examples in the message are examples, not an exhaustive symbol list.
 */

export const PASSWORD_MIN_LENGTH = 8

export const PASSWORD_REQUIREMENT_IDS = ['min_length', 'special_character'] as const

export type PasswordRequirement =
  | (typeof PASSWORD_REQUIREMENT_IDS)[number]
  | 'uppercase'
  | 'lowercase'
  | 'number'

export type PasswordValidationResult = {
  valid: boolean
  unmetRequirements: PasswordRequirement[]
}

export const PASSWORD_MIN_LENGTH_MESSAGE = `Use at least ${PASSWORD_MIN_LENGTH} characters.`

export const PASSWORD_SPECIAL_CHARACTER_MESSAGE =
  'Include a special character, such as ! @ # $ % ^ & *.'

export const PASSWORD_UPPERCASE_MESSAGE = 'Include an uppercase letter.'

export const PASSWORD_LOWERCASE_MESSAGE = 'Include a lowercase letter.'

export const PASSWORD_NUMBER_MESSAGE = 'Include a number.'

export const PASSWORD_REQUIREMENT_LABELS: Record<
  (typeof PASSWORD_REQUIREMENT_IDS)[number],
  string
> = {
  min_length: `At least ${PASSWORD_MIN_LENGTH} characters`,
  special_character: 'A special character, such as ! @ # $ % ^ & *',
}

const PASSWORD_REQUIREMENT_MESSAGES: Record<PasswordRequirement, string> = {
  min_length: PASSWORD_MIN_LENGTH_MESSAGE,
  special_character: PASSWORD_SPECIAL_CHARACTER_MESSAGE,
  uppercase: PASSWORD_UPPERCASE_MESSAGE,
  lowercase: PASSWORD_LOWERCASE_MESSAGE,
  number: PASSWORD_NUMBER_MESSAGE,
}

export function validatePasswordPolicy(password: string): PasswordValidationResult {
  const unmetRequirements: PasswordRequirement[] = []
  if (password.length < PASSWORD_MIN_LENGTH) unmetRequirements.push('min_length')
  if (!hasSpecialCharacter(password)) unmetRequirements.push('special_character')
  return { valid: unmetRequirements.length === 0, unmetRequirements }
}

export function passwordPolicyErrorMessage(
  unmetRequirements: readonly PasswordRequirement[]
): string {
  return unmetRequirements.map((requirement) => PASSWORD_REQUIREMENT_MESSAGES[requirement]).join(' ')
}

export type PasswordResetSubmitDecision =
  | { ok: true }
  | { ok: false; field: 'password' | 'confirm'; error: string }

/** Local gate used by the reset form and the server action. Does not call Auth. */
export function preparePasswordResetSubmit(
  password: string,
  confirmPassword: string
): PasswordResetSubmitDecision {
  const policy = validatePasswordPolicy(password)
  if (!policy.valid) {
    return {
      ok: false,
      field: 'password',
      error: passwordPolicyErrorMessage(policy.unmetRequirements),
    }
  }

  const confirmError = validatePasswordConfirmation(password, confirmPassword)
  if (confirmError) return { ok: false, field: 'confirm', error: confirmError }
  return { ok: true }
}

/**
 * Maps a known Auth password-policy rejection to friendly requirement text.
 * Returns null when the message is not a recognized policy failure.
 * Never returns the provider message or the password.
 */
export function friendlyPasswordPolicyError(
  message: string,
  password: string
): string | null {
  const lower = message.toLowerCase()

  if (lower.includes('password should be at least')) {
    return PASSWORD_MIN_LENGTH_MESSAGE
  }

  if (!lower.includes('password should contain at least one character of each')) {
    return null
  }

  const missing: PasswordRequirement[] = []
  if (!/[a-z]/.test(password)) missing.push('lowercase')
  if (!/[A-Z]/.test(password)) missing.push('uppercase')
  if (!/[0-9]/.test(password)) missing.push('number')
  if (!hasSpecialCharacter(password)) missing.push('special_character')
  if (missing.length === 0) return PASSWORD_SPECIAL_CHARACTER_MESSAGE
  return passwordPolicyErrorMessage(missing)
}

function hasSpecialCharacter(password: string): boolean {
  return /[^A-Za-z0-9]/.test(password)
}
