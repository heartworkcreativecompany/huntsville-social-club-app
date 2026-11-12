import { friendlyAuthError } from '@/lib/auth-errors'
import {
  validateEmail,
  validatePassword,
  validatePasswordConfirmation,
} from '@/lib/auth-validation'
import {
  ESSENTIAL_EMAIL_ACKNOWLEDGEMENT_REQUIRED_MESSAGE,
  signupEmailConsentMetadata,
} from '@/lib/email-consent'
import { safeUpgradeReturnPath } from '@/lib/membership-plan-links'
import { signupNameError, signupNameMetadata } from '@/lib/signup-name'
import { authCallbackUrl } from '@/lib/site'

export type SignUpAccountInput = {
  givenName: string
  familyName: string
  email: string
  password: string
  confirmPassword: string
  essentialAcknowledged: boolean
  marketingOptIn: boolean
  returnPath: string | null
}

export type SignUpAccountDeps = {
  removedBlock: (email: string) => Promise<string | null>
  signUp: (args: {
    email: string
    password: string
    options: {
      emailRedirectTo: string
      data: Record<string, string | boolean>
    }
  }) => Promise<{ error: { message: string } | null }>
}

/**
 * Server signup. The removed-email check runs before Auth signup.
 * A direct call to hosted Auth with the public anon key can still skip this
 * until an Auth hook exists. Application submit keeps its own server check.
 */
export async function signUpAccount(
  input: SignUpAccountInput,
  deps: SignUpAccountDeps
): Promise<{ error?: string }> {
  const givenNameError = signupNameError(input.givenName, true)
  if (givenNameError) return { error: givenNameError }

  const familyNameError = signupNameError(input.familyName, false)
  if (familyNameError) return { error: familyNameError }

  const emailError = validateEmail(input.email)
  if (emailError) return { error: emailError }

  const passwordError = validatePassword(input.password)
  if (passwordError) return { error: passwordError }

  const confirmError = validatePasswordConfirmation(
    input.password,
    input.confirmPassword
  )
  if (confirmError) return { error: confirmError }

  if (!input.essentialAcknowledged) {
    return { error: ESSENTIAL_EMAIL_ACKNOWLEDGEMENT_REQUIRED_MESSAGE }
  }

  const trimmedEmail = input.email.trim()
  const returnPath = safeUpgradeReturnPath(input.returnPath) ?? '/login?confirmed=1'
  const blocked = await deps.removedBlock(trimmedEmail)
  if (blocked) return { error: blocked }

  const { error } = await deps.signUp({
    email: trimmedEmail,
    password: input.password,
    options: {
      emailRedirectTo: authCallbackUrl(returnPath),
      data: {
        ...signupNameMetadata({
          givenName: input.givenName,
          familyName: input.familyName,
        }),
        ...signupEmailConsentMetadata({
          essentialAcknowledged: input.essentialAcknowledged,
          marketingOptIn: input.marketingOptIn,
        }),
      },
    },
  })

  if (error) return { error: friendlyAuthError(error.message) }
  return {}
}
