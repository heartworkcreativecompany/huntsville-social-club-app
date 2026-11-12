import { describe, expect, it, vi } from 'vitest'
import { REMOVED_APPLICATION_MESSAGE } from '@/lib/member-removal'
import { signUpAccount, type SignUpAccountInput } from '@/lib/signup-account'

const input = {
  givenName: 'Ada',
  familyName: 'Lovelace',
  email: '  Person@Example.com ',
  password: 'password1',
  confirmPassword: 'password1',
  essentialAcknowledged: true,
  marketingOptIn: false,
  returnPath: null,
} satisfies SignUpAccountInput

function deps(blockedEmails: string[]) {
  const signUp = vi.fn(async () => ({ error: null }))
  return {
    signUp,
    removedBlock: vi.fn(async (email: string) => {
      const normalized = email.trim().toLowerCase()
      return blockedEmails.includes(normalized) ? REMOVED_APPLICATION_MESSAGE : null
    }),
  }
}

describe('server signup removed-email block', () => {
  it('blocks a removed email before Auth signup', async () => {
    const run = deps(['person@example.com'])
    const result = await signUpAccount(input, run)
    expect(result.error).toBe(REMOVED_APPLICATION_MESSAGE)
    expect(result.error).not.toMatch(/remov/i)
    expect(run.signUp).not.toHaveBeenCalled()
    expect(run.removedBlock).toHaveBeenCalledWith('Person@Example.com')
  })

  it('blocks the same email with different capitalization and extra spaces', async () => {
    const run = deps(['person@example.com'])
    const spaced = await signUpAccount(
      { ...input, email: '   PERSON@example.com   ' },
      run
    )
    const mixed = await signUpAccount(
      { ...input, email: ' Person@Example.com ' },
      run
    )
    expect(spaced.error).toBe(REMOVED_APPLICATION_MESSAGE)
    expect(mixed.error).toBe(REMOVED_APPLICATION_MESSAGE)
    expect(run.removedBlock).toHaveBeenNthCalledWith(1, 'PERSON@example.com')
    expect(run.removedBlock).toHaveBeenNthCalledWith(2, 'Person@Example.com')
    expect(run.signUp).not.toHaveBeenCalled()
  })

  it('signs up an email that is not removed', async () => {
    const run = deps(['person@example.com'])
    const result = await signUpAccount(
      { ...input, email: 'new.person@example.com' },
      run
    )
    expect(result.error).toBeUndefined()
    expect(run.signUp).toHaveBeenCalledOnce()
    expect(run.signUp.mock.calls[0]?.[0].email).toBe('new.person@example.com')
  })
})
