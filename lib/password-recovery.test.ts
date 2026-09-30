import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  INVALID_LOGIN_CREDENTIALS_MESSAGE,
  PASSWORD_RESET_REQUEST_SUCCESS,
  PASSWORD_UPDATE_FAILED_MESSAGE,
  RECOVERY_BROWSER_MESSAGE,
  RECOVERY_LINK_INVALID_MESSAGE,
  TEMPORARY_AUTH_PROBLEM_MESSAGE,
  friendlyAuthError,
} from '@/lib/auth-errors'
import {
  PASSWORD_RECOVERY_COOKIE,
  PASSWORD_RECOVERY_MAX_AGE_SECONDS,
  createPasswordRecoveryMarker,
  passwordRecoveryCookieOptions,
  recoveryAllowsPasswordUpdate,
  verifyPasswordRecoveryMarker,
} from '@/lib/password-recovery'
import {
  RECOVERY_BROWSER_PATH,
  RECOVERY_LINK_INVALID_PATH,
  RECOVERY_LOGIN_PATH,
  authCallbackRedirectExposesSecrets,
} from '@/lib/auth-callback'

const SECRET = 'test-recovery-secret'
const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'

function assertNoDisclosure(message: string) {
  const lower = message.toLowerCase()
  expect(lower).not.toContain('supabase')
  expect(lower).not.toContain('user not found')
  expect(lower).not.toContain('example.com')
  expect(message).not.toContain('@')
  expect(lower).not.toContain('access_token')
  expect(lower).not.toContain('refresh_token')
  expect(lower).not.toContain('eyj')
  expect(message).not.toMatch(/code=/i)
}

describe('password recovery marker', () => {
  it('round-trips a user id and rejects expiry, tampering, and the wrong secret', async () => {
    const now = 1_700_000_000_000
    const marker = await createPasswordRecoveryMarker(USER_A, SECRET, now)
    expect(marker).toBeTruthy()
    expect(await verifyPasswordRecoveryMarker(marker!, SECRET, now + 1_000)).toBe(USER_A)
    expect(
      await verifyPasswordRecoveryMarker(
        marker!,
        SECRET,
        now + PASSWORD_RECOVERY_MAX_AGE_SECONDS * 1000
      )
    ).toBeNull()
    expect(await verifyPasswordRecoveryMarker(`${marker}x`, SECRET, now + 1_000)).toBeNull()
    expect(await verifyPasswordRecoveryMarker(marker!, 'other-secret', now + 1_000)).toBeNull()
    expect(await createPasswordRecoveryMarker(USER_A, '')).toBeNull()
    expect(await verifyPasswordRecoveryMarker(marker!, '', now + 1_000)).toBeNull()
  })

  it('uses a short-lived httpOnly cookie and does not authorize an ordinary session', () => {
    const options = passwordRecoveryCookieOptions()
    expect(PASSWORD_RECOVERY_COOKIE).toBe('hsc_password_recovery')
    expect(options.httpOnly).toBe(true)
    expect(options.sameSite).toBe('lax')
    expect(options.path).toBe('/')
    expect(options.maxAge).toBe(PASSWORD_RECOVERY_MAX_AGE_SECONDS)
    expect(recoveryAllowsPasswordUpdate(null, USER_A)).toBe(false)
    expect(recoveryAllowsPasswordUpdate(USER_A, USER_B)).toBe(false)
    expect(recoveryAllowsPasswordUpdate(USER_A, null)).toBe(false)
    expect(recoveryAllowsPasswordUpdate(USER_A, USER_A)).toBe(true)
  })
})

describe('recovery destinations stay on site', () => {
  it('never places a code or token on recovery redirect paths', () => {
    for (const path of [
      RECOVERY_LOGIN_PATH,
      RECOVERY_LINK_INVALID_PATH,
      RECOVERY_BROWSER_PATH,
    ]) {
      expect(path.startsWith('/login')).toBe(true)
      expect(authCallbackRedirectExposesSecrets(path)).toBe(false)
      expect(path).not.toContain('http')
      expect(path).not.toMatch(/code=|token|@/i)
    }
  })
})

describe('friendlyAuthError', () => {
  it('distinguishes recovery and login failures without disclosing accounts', () => {
    expect(friendlyAuthError('Invalid login credentials')).toBe(
      INVALID_LOGIN_CREDENTIALS_MESSAGE
    )
    expect(friendlyAuthError('Email link is invalid or has expired')).toBe(
      RECOVERY_LINK_INVALID_MESSAGE
    )
    expect(friendlyAuthError('code verifier not found in storage')).toBe(
      RECOVERY_BROWSER_MESSAGE
    )
    expect(friendlyAuthError('Unable to update password')).toBe(
      PASSWORD_UPDATE_FAILED_MESSAGE
    )
    expect(friendlyAuthError('Network request failed')).toBe(
      TEMPORARY_AUTH_PROBLEM_MESSAGE
    )
    expect(friendlyAuthError('User not found')).toBe(
      'Something went wrong. Please try again.'
    )

    for (const raw of [
      'Invalid login credentials',
      'User not found',
      'code verifier not found in storage',
      'Email link is invalid or has expired',
      'Unable to update password for member@example.com token eyJhbGci',
      'fetch failed',
    ]) {
      assertNoDisclosure(friendlyAuthError(raw))
    }

    expect(PASSWORD_RESET_REQUEST_SUCCESS.toLowerCase()).toContain('if an account exists')
    assertNoDisclosure(PASSWORD_RESET_REQUEST_SUCCESS.replace('If an account exists for that email, ', ''))
  })
})

describe('reset page does not trust an ordinary session', () => {
  it('keeps updateUser behind the recovery check and out of the page', () => {
    const page = readFileSync(
      join(__dirname, '../app/login/reset-password/page.tsx'),
      'utf8'
    )
    const form = readFileSync(
      join(__dirname, '../app/login/reset-password/reset-password-form.tsx'),
      'utf8'
    )
    const action = readFileSync(
      join(__dirname, '../app/login/reset-password/actions.ts'),
      'utf8'
    )
    const callback = readFileSync(
      join(__dirname, '../app/auth/callback/route.ts'),
      'utf8'
    )

    expect(page).not.toContain('updateUser')
    expect(page).not.toContain('getSession')
    expect(form).not.toContain('updateUser')
    expect(form).not.toContain('getSession')
    expect(form).toContain('updatePasswordFromRecovery')
    expect(page).toContain('recoveryAllowsPasswordUpdate')
    expect(page).toContain('/login/forgot-password')

    const guardAt = action.indexOf('recoveryAllowsPasswordUpdate')
    const updateAt = action.indexOf('updateUser')
    expect(guardAt).toBeGreaterThan(-1)
    expect(updateAt).toBeGreaterThan(guardAt)
    expect(action).toContain("redirect('/login?reset=success')")
    expect(action).toContain('signOut')
    expect(callback).toContain('createPasswordRecoveryMarker')
    expect(callback).not.toContain('console.log')
  })
})
