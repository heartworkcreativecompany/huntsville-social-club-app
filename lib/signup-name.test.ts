import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  mergeProfileIntoDraft,
  profileColumnsFromDraft,
} from '@/lib/application-draft-sync'
import {
  contactNameBody,
  contactWritePayload,
  enrollmentCreateBody,
  resolveMarketingContactNames,
  runEmailMarketingSyncAttempt,
} from '@/lib/email-marketing-sync'
import {
  signupNameError,
  signupNameMetadata,
} from '@/lib/signup-name'

const repoRoot = process.cwd()

describe('signup name validation', () => {
  it('requires a given name and allows a blank family name', () => {
    expect(signupNameError('   ', true)).toBe('Enter your first name.')
    expect(signupNameError('   ', false)).toBeNull()
    expect(signupNameMetadata({ givenName: '  李  ', familyName: '   ' })).toEqual({
      given_name: '李',
      family_name: '',
    })
  })

  it('keeps unicode, spaces, apostrophes, and hyphens', () => {
    expect(
      signupNameMetadata({
        givenName: '  Anne   Marie ',
        familyName: "O'Brien-李",
      })
    ).toEqual({
      given_name: 'Anne Marie',
      family_name: "O'Brien-李",
    })
    expect(signupNameError("O'Brien-李", true)).toBeNull()
  })

  it('rejects hidden characters and names longer than 80 characters', () => {
    expect(signupNameError('Ann\u0000e', true)).toBe(
      'Remove hidden characters from your name.'
    )
    expect(signupNameError('a'.repeat(81), true)).toBe('Use 80 characters or fewer.')
    expect(signupNameError('a'.repeat(80), false)).toBeNull()
  })
})

describe('signup form names', () => {
  const signup = readFileSync(resolve(repoRoot, 'app/signup/page.tsx'), 'utf8')

  it('collects given and family names with autocomplete and sends them beside consent', () => {
    expect(signup).toContain('autoComplete="given-name"')
    expect(signup).toContain('autoComplete="family-name"')
    expect(signup).toContain('signupNameMetadata')
    expect(signup).toContain('signupNameError(givenName, true)')
    expect(signup).toContain('signupNameError(familyName, false)')
    expect(signup).toContain('signupEmailConsentMetadata')
  })
})

describe('application prefill from signup names', () => {
  it('fills empty draft names and does not copy them into the public display name', () => {
    const merged = mergeProfileIntoDraft({
      full_name: null,
      given_name: 'Nicole',
      family_name: null,
      membership_intent: null,
      location_area: null,
      application_draft: null,
    })
    expect(merged.profile.firstName).toBe('Nicole')
    expect(merged.profile.lastName).toBe('')
    expect(merged.profile.displayName).toBe('')
    expect(profileColumnsFromDraft(merged).full_name).toBeNull()
  })

  it('does not replace names already stored on the draft', () => {
    const merged = mergeProfileIntoDraft({
      full_name: 'Public Name',
      given_name: 'Nicole',
      family_name: 'Mills',
      membership_intent: null,
      location_area: null,
      application_draft: {
        version: 2,
        profile: { firstName: 'Ada', lastName: 'Lovelace' },
      },
    })
    expect(merged.profile.firstName).toBe('Ada')
    expect(merged.profile.lastName).toBe('Lovelace')
    expect(merged.profile.displayName).toBe('Public Name')
  })

  it('fills only the empty draft field and keeps a legacy display-name split for accounts without signup names', () => {
    const partial = mergeProfileIntoDraft({
      full_name: null,
      given_name: null,
      family_name: 'Mills',
      membership_intent: null,
      location_area: null,
      application_draft: {
        version: 2,
        profile: { firstName: 'Ada', lastName: '' },
      },
    })
    expect(partial.profile.firstName).toBe('Ada')
    expect(partial.profile.lastName).toBe('Mills')

    const legacy = mergeProfileIntoDraft({
      full_name: 'Ada Lovelace',
      membership_intent: null,
      location_area: null,
      application_draft: null,
    })
    expect(legacy.profile.firstName).toBe('Ada')
    expect(legacy.profile.lastName).toBe('Lovelace')
    expect(legacy.profile.displayName).toBe('Ada Lovelace')
  })
})

const confirmedOptIn = {
  email: 'person@example.com',
  emailConfirmed: true,
  optIn: true,
  optedOutAt: null,
}

describe('marketing contact names', () => {
  it('uses signup names before an application exists', () => {
    expect(
      resolveMarketingContactNames({
        givenName: ' Nicole ',
        familyName: null,
      })
    ).toEqual({ firstName: 'Nicole', lastName: null })
    expect(
      enrollmentCreateBody({
        unsubscribed: false,
        names: { firstName: 'Nicole', lastName: null },
      })
    ).toEqual({ unsubscribed: false, first_name: 'Nicole' })
  })

  it('uses explicit application names when the account has no signup names', () => {
    expect(
      resolveMarketingContactNames({
        applicationFirstName: ' Ada ',
        applicationLastName: 'Lovelace',
        givenName: null,
        familyName: null,
      })
    ).toEqual({ firstName: 'Ada', lastName: 'Lovelace' })
  })

  it('lets each explicit application name replace the signup name', () => {
    expect(
      resolveMarketingContactNames({
        applicationFirstName: 'Ada',
        applicationLastName: ' ',
        givenName: 'Nicole',
        familyName: 'Mills',
      })
    ).toEqual({ firstName: 'Ada', lastName: 'Mills' })
    expect(
      resolveMarketingContactNames({
        applicationFirstName: 'Ada',
        applicationLastName: 'Lovelace',
        givenName: 'Nicole',
        familyName: 'Mills',
      })
    ).toEqual({ firstName: 'Ada', lastName: 'Lovelace' })
  })

  it('creates a missing contact with signup names and does not split a display name', async () => {
    const sends: Array<{ method: string; body: Record<string, unknown> }> = []
    const names: unknown[] = []
    const decision = await runEmailMarketingSyncAttempt({
      action: 'enroll',
      readLocal: async () => ({
        ...confirmedOptIn,
        givenName: 'Nicole',
        familyName: null,
      }),
      lookupProvider: async () => 'missing',
      send: async (input) => {
        sends.push({ method: input.method, body: input.body })
      },
      sendName: async (input) => {
        names.push(input.body)
      },
      recordProviderUnsubscribe: async () => {
        throw new Error('should not record provider unsubscribe')
      },
    })
    expect(decision).toBe('send_unsubscribed_false')
    expect(sends).toEqual([
      { method: 'POST', body: { unsubscribed: false, first_name: 'Nicole' } },
    ])
    expect(names).toEqual([])
    expect(
      contactWritePayload({
        method: 'POST',
        email: 'person@example.com',
        body: enrollmentCreateBody({
          unsubscribed: false,
          names: { firstName: 'Nicole', lastName: 'Mills' },
        }),
      })
    ).toEqual({
      email: 'person@example.com',
      unsubscribed: false,
      first_name: 'Nicole',
      last_name: 'Mills',
    })
    expect(contactNameBody({ firstName: null, lastName: null })).toBeNull()
  })

  it('creates a missing contact from application names after a status-function 404', async () => {
    const handler = readFileSync(
      resolve(repoRoot, 'supabase/functions/application-status-email/handler.ts'),
      'utf8'
    )
    expect(handler).toContain("if (lookup.status === 'missing') return { ok: true }")
    expect(handler).not.toContain('async function createContact')

    const sends: Array<{ method: string; body: Record<string, unknown> }> = []
    await runEmailMarketingSyncAttempt({
      action: 'enroll',
      readLocal: async () => ({
        ...confirmedOptIn,
        givenName: null,
        familyName: null,
        applicationFirstName: 'Nicole',
        applicationLastName: 'Mills',
      }),
      lookupProvider: async () => 'missing',
      send: async (input) => {
        sends.push({ method: input.method, body: input.body })
      },
      sendName: async () => {
        throw new Error('create already includes the name')
      },
      recordProviderUnsubscribe: async () => {
        throw new Error('should not record provider unsubscribe')
      },
    })
    expect(sends).toEqual([
      {
        method: 'POST',
        body: { unsubscribed: false, first_name: 'Nicole', last_name: 'Mills' },
      },
    ])
  })

  it('patches a found contact with the subscription flag and a separate name-only body', async () => {
    const sends: Array<{ method: string; body: Record<string, unknown> }> = []
    const names: Array<Record<string, unknown>> = []
    await runEmailMarketingSyncAttempt({
      action: 'enroll',
      readLocal: async () => ({
        ...confirmedOptIn,
        givenName: 'Nicole',
        familyName: 'Mills',
        applicationFirstName: 'Ada',
        applicationLastName: 'Lovelace',
      }),
      lookupProvider: async () => 'subscribed',
      send: async (input) => {
        sends.push({ method: input.method, body: input.body })
      },
      sendName: async (input) => {
        names.push(input.body)
      },
      recordProviderUnsubscribe: async () => {
        throw new Error('should not record provider unsubscribe')
      },
    })
    expect(sends).toEqual([{ method: 'PATCH', body: { unsubscribed: false } }])
    expect(names).toEqual([{ first_name: 'Ada', last_name: 'Lovelace' }])
    expect(Object.keys(names[0] ?? {})).not.toContain('unsubscribed')
    expect(
      contactWritePayload({
        method: 'PATCH',
        email: 'person@example.com',
        body: { unsubscribed: false, first_name: 'Ada', last_name: 'Lovelace' },
      })
    ).toEqual({ unsubscribed: false })
  })

  it('does not clear a provider name when no local name is resolved', async () => {
    const names: unknown[] = []
    const sends: Array<Record<string, unknown>> = []
    await runEmailMarketingSyncAttempt({
      action: 'enroll',
      readLocal: async () => ({
        ...confirmedOptIn,
        givenName: '   ',
        familyName: null,
        applicationFirstName: null,
        applicationLastName: '',
      }),
      lookupProvider: async () => 'subscribed',
      send: async (input) => {
        sends.push(input.body)
      },
      sendName: async (input) => {
        names.push(input.body)
      },
      recordProviderUnsubscribe: async () => {
        throw new Error('should not record provider unsubscribe')
      },
    })
    expect(sends).toEqual([{ unsubscribed: false }])
    expect(names).toEqual([])
  })

  it('does not write names or create a contact during withdrawal', async () => {
    const sends: Array<{ method: string; body: Record<string, unknown> }> = []
    const names: unknown[] = []
    const decision = await runEmailMarketingSyncAttempt({
      action: 'withdraw',
      readLocal: async () => ({
        ...confirmedOptIn,
        optIn: false,
        optedOutAt: '2026-10-07T00:00:00.000Z',
        givenName: 'Nicole',
        familyName: 'Mills',
        applicationFirstName: 'Ada',
        applicationLastName: 'Lovelace',
      }),
      lookupProvider: async () => 'subscribed',
      send: async (input) => {
        sends.push({ method: input.method, body: input.body })
      },
      sendName: async (input) => {
        names.push(input.body)
      },
      recordProviderUnsubscribe: async () => {
        throw new Error('should not record provider unsubscribe')
      },
    })
    expect(decision).toBe('send_unsubscribed_true')
    expect(sends).toEqual([{ method: 'PATCH', body: { unsubscribed: true } }])
    expect(names).toEqual([])
  })

  it('does not create a contact when marketing was not accepted', async () => {
    const sends: string[] = []
    const decision = await runEmailMarketingSyncAttempt({
      action: 'enroll',
      readLocal: async () => ({
        ...confirmedOptIn,
        optIn: false,
        givenName: 'Nicole',
        familyName: 'Mills',
        applicationFirstName: 'Ada',
        applicationLastName: 'Lovelace',
      }),
      lookupProvider: async () => 'missing',
      send: async () => {
        sends.push('send')
      },
      sendName: async () => {
        sends.push('name')
      },
      recordProviderUnsubscribe: async () => undefined,
    })
    expect(decision).toBe('skip_not_opted_in')
    expect(sends).toEqual([])
  })
})
