import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { REMOVED_APPLICATION_MESSAGE } from '@/lib/member-removal'
import { signUpAccount, type SignUpAccountInput } from '@/lib/signup-account'
import { authCallbackUrl } from '@/lib/site'

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

  it('uses only a safe upgrade return path in the confirmation link', async () => {
    const redirectFor = async (returnPath: string) => {
      const run = deps([])
      const result = await signUpAccount(
        { ...input, email: 'new.person@example.com', returnPath },
        run
      )
      expect(result.error).toBeUndefined()
      return run.signUp.mock.calls[0]?.[0].options.emailRedirectTo
    }

    expect(await redirectFor('https://evil.example')).toBe(
      authCallbackUrl('/login?confirmed=1')
    )
    expect(await redirectFor('//evil.example')).toBe(
      authCallbackUrl('/login?confirmed=1')
    )
    expect(await redirectFor('/upgrade?plan=inner_circle')).toBe(
      authCallbackUrl('/upgrade?plan=inner_circle')
    )
  })

  it('signs up through the cookie-based server client, not the anonymous client', () => {
    const action = readFileSync(join(process.cwd(), 'app/signup/actions.ts'), 'utf8')
    expect(action).toContain("from '@/lib/supabase/server'")
    expect(action).toContain('await createClient()')
    expect(action).toContain('await supabase.auth.signUp(args)')
    expect(action).not.toContain('createAnonymousClient')
    expect(action).not.toContain('@/lib/supabase/anonymous')
    expect(action.indexOf('removedApplicationBlock')).toBeLessThan(
      action.indexOf('auth.signUp')
    )
  })
})
