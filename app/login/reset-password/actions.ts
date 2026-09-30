'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  PASSWORD_UPDATE_FAILED_MESSAGE,
  RECOVERY_LINK_INVALID_MESSAGE,
  friendlyAuthError,
} from '@/lib/auth-errors'
import { validatePassword, validatePasswordConfirmation } from '@/lib/auth-validation'
import {
  PASSWORD_RECOVERY_COOKIE,
  passwordRecoveryCookieOptions,
  passwordRecoverySecret,
  recoveryAllowsPasswordUpdate,
  verifyPasswordRecoveryMarker,
} from '@/lib/password-recovery'
import { createClient } from '@/lib/supabase/server'

const GENERIC_AUTH_ERROR = 'Something went wrong. Please try again.'

export async function updatePasswordFromRecovery(
  password: string,
  confirmPassword: string
): Promise<{ error: string }> {
  const passwordError = validatePassword(password)
  if (passwordError) return { error: passwordError }

  const confirmError = validatePasswordConfirmation(password, confirmPassword)
  if (confirmError) return { error: confirmError }

  const cookieStore = await cookies()
  const markerUserId = await verifyPasswordRecoveryMarker(
    cookieStore.get(PASSWORD_RECOVERY_COOKIE)?.value,
    passwordRecoverySecret()
  )
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!recoveryAllowsPasswordUpdate(markerUserId, user?.id)) {
    cookieStore.set(PASSWORD_RECOVERY_COOKIE, '', passwordRecoveryCookieOptions(0))
    return { error: RECOVERY_LINK_INVALID_MESSAGE }
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    const friendly = friendlyAuthError(error.message)
    return {
      error: friendly === GENERIC_AUTH_ERROR ? PASSWORD_UPDATE_FAILED_MESSAGE : friendly,
    }
  }

  await supabase.auth.signOut()
  cookieStore.set(PASSWORD_RECOVERY_COOKIE, '', passwordRecoveryCookieOptions(0))
  redirect('/login?reset=success')
}
