import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PASSWORD_UPDATE_FAILED_MESSAGE,
  RECOVERY_LINK_INVALID_MESSAGE,
  TEMPORARY_AUTH_PROBLEM_MESSAGE,
} from '@/lib/auth-errors'
import { PASSWORD_SPECIAL_CHARACTER_MESSAGE, PASSWORD_UPPERCASE_MESSAGE } from '@/lib/password-policy'
import { PASSWORD_RECOVERY_COOKIE, createPasswordRecoveryMarker } from '@/lib/password-recovery'

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'
const SECRET = 'test-recovery-secret'

const { updateUser, signOut, cookieSet, state } = vi.hoisted(() => ({
  updateUser: vi.fn(),
  signOut: vi.fn(),
  cookieSet: vi.fn(),
  state: {
    cookieValue: undefined as string | undefined,
    sessionUserId: null as string | null,
  },
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () =>
      state.cookieValue
        ? { name: PASSWORD_RECOVERY_COOKIE, value: state.cookieValue }
        : undefined,
    set: cookieSet,
  }),
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: state.sessionUserId ? { id: state.sessionUserId } : null },
      }),
      updateUser,
      signOut,
    },
  }),
}))

import { updatePasswordFromRecovery } from '@/app/login/reset-password/actions'

describe('updatePasswordFromRecovery', () => {
  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = SECRET
    state.cookieValue = undefined
    state.sessionUserId = USER_A
    updateUser.mockReset()
    updateUser.mockResolvedValue({ error: null })
    signOut.mockReset()
    signOut.mockResolvedValue({ error: null })
    cookieSet.mockReset()
  })

  it('does not update a password for an ordinary signed-in session', async () => {
    const result = await updatePasswordFromRecovery('new-password-1', 'new-password-1')
    expect(result.error).toBe(RECOVERY_LINK_INVALID_MESSAGE)
    expect(updateUser).not.toHaveBeenCalled()
    expect(signOut).not.toHaveBeenCalled()
    expect(cookieSet).toHaveBeenCalledWith(
      PASSWORD_RECOVERY_COOKIE,
      '',
      expect.objectContaining({ httpOnly: true, maxAge: 0 })
    )
  })

  it('does not update a password when the recovery marker belongs to someone else', async () => {
    state.cookieValue = (await createPasswordRecoveryMarker(USER_B, SECRET)) ?? undefined
    state.sessionUserId = USER_A
    const result = await updatePasswordFromRecovery('new-password-1', 'new-password-1')
    expect(result.error).toBe(RECOVERY_LINK_INVALID_MESSAGE)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('does not update a password when the recovery marker is expired', async () => {
    const issuedAt = Date.now() - 11 * 60 * 1000
    state.cookieValue =
      (await createPasswordRecoveryMarker(USER_A, SECRET, issuedAt)) ?? undefined
    const result = await updatePasswordFromRecovery('new-password-1', 'new-password-1')
    expect(result.error).toBe(RECOVERY_LINK_INVALID_MESSAGE)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('updates the password for a verified recovery session, then signs out', async () => {
    state.cookieValue = (await createPasswordRecoveryMarker(USER_A, SECRET)) ?? undefined
    await expect(
      updatePasswordFromRecovery('new-password-1', 'new-password-1')
    ).rejects.toThrow('REDIRECT:/login?reset=success')
    expect(updateUser).toHaveBeenCalledTimes(1)
    expect(updateUser).toHaveBeenCalledWith({ password: 'new-password-1' })
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(cookieSet).toHaveBeenCalledWith(
      PASSWORD_RECOVERY_COOKIE,
      '',
      expect.objectContaining({ httpOnly: true, maxAge: 0, path: '/' })
    )
  })

  it('does not update a password that is missing a special character', async () => {
    state.cookieValue = (await createPasswordRecoveryMarker(USER_A, SECRET)) ?? undefined
    const password = 'Letters1234'
    const result = await updatePasswordFromRecovery(password, password)
    expect(result.error).toBe(PASSWORD_SPECIAL_CHARACTER_MESSAGE)
    expect(result.error).not.toContain(password)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('maps an Auth password-policy rejection to the unmet rule', async () => {
    state.cookieValue = (await createPasswordRecoveryMarker(USER_A, SECRET)) ?? undefined
    const password = 'letters123!'
    updateUser.mockResolvedValue({
      error: {
        message:
          'Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789:!@#$%^&*',
      },
    })
    const result = await updatePasswordFromRecovery(password, password)
    expect(result.error).toBe(PASSWORD_UPPERCASE_MESSAGE)
    expect(result.error).not.toContain(password)
    expect(result.error).not.toContain('There was an error processing your request')
    expect(updateUser).toHaveBeenCalledTimes(1)
    expect(signOut).not.toHaveBeenCalled()
  })

  it('keeps an unexpected Auth failure generic', async () => {
    state.cookieValue = (await createPasswordRecoveryMarker(USER_A, SECRET)) ?? undefined
    updateUser.mockResolvedValue({
      error: { message: 'There was an error processing your request.' },
    })
    const result = await updatePasswordFromRecovery('new-password-1', 'new-password-1')
    expect(result.error).toBe(PASSWORD_UPDATE_FAILED_MESSAGE)
    expect(result.error).not.toContain('There was an error processing your request')
    expect(updateUser).toHaveBeenCalledTimes(1)
  })

  it('keeps a temporary Auth failure generic', async () => {
    state.cookieValue = (await createPasswordRecoveryMarker(USER_A, SECRET)) ?? undefined
    updateUser.mockResolvedValue({ error: { message: 'fetch failed' } })
    const result = await updatePasswordFromRecovery('new-password-1', 'new-password-1')
    expect(result.error).toBe(TEMPORARY_AUTH_PROBLEM_MESSAGE)
    expect(updateUser).toHaveBeenCalledTimes(1)
  })

  it('hides raw provider details when the password update fails', async () => {
    state.cookieValue = (await createPasswordRecoveryMarker(USER_A, SECRET)) ?? undefined
    updateUser.mockResolvedValue({
      error: {
        message: 'Unable to update password for member@example.com access_token=eyJabc',
      },
    })
    const result = await updatePasswordFromRecovery('new-password-1', 'new-password-1')
    expect(result.error).toBe(PASSWORD_UPDATE_FAILED_MESSAGE)
    expect(result.error).not.toContain('example.com')
    expect(result.error).not.toContain('eyJ')
    expect(signOut).not.toHaveBeenCalled()
  })
})
