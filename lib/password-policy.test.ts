import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ResetPasswordForm from '@/app/login/reset-password/reset-password-form'
import {
  PASSWORD_MIN_LENGTH_MESSAGE,
  PASSWORD_REQUIREMENT_IDS,
  PASSWORD_REQUIREMENT_LABELS,
  PASSWORD_SPECIAL_CHARACTER_MESSAGE,
  PASSWORD_UPPERCASE_MESSAGE,
  friendlyPasswordPolicyError,
  preparePasswordResetSubmit,
  validatePasswordPolicy,
} from '@/lib/password-policy'

const LETTERS_AND_NUMBERS = 'Letters1234'
const TOO_SHORT = 'Ab1!'
const COMPLIANT = 'new-password-1'

function assertPasswordNotDisclosed(message: string, password: string) {
  expect(message).not.toContain(password)
  expect(message.toLowerCase()).not.toContain('supabase')
  expect(message).not.toContain('abcdefghijklmnopqrstuvwxyz')
  expect(message).not.toContain('There was an error processing your request')
}

describe('confirmed password policy', () => {
  it('requires 8 characters and a special character, and no unconfirmed character classes', () => {
    expect(PASSWORD_REQUIREMENT_IDS).toEqual(['min_length', 'special_character'])
    expect(PASSWORD_REQUIREMENT_LABELS.min_length).toBe('At least 8 characters')
    expect(PASSWORD_REQUIREMENT_LABELS.special_character).toBe(
      'A special character, such as ! @ # $ % ^ & *'
    )
    expect(validatePasswordPolicy(COMPLIANT)).toEqual({
      valid: true,
      unmetRequirements: [],
    })
    expect(validatePasswordPolicy('!!!!!!!!').valid).toBe(true)
  })

  it('rejects letters and numbers that omit a special character', () => {
    const result = validatePasswordPolicy(LETTERS_AND_NUMBERS)
    expect(result).toEqual({
      valid: false,
      unmetRequirements: ['special_character'],
    })
    const decision = preparePasswordResetSubmit(LETTERS_AND_NUMBERS, LETTERS_AND_NUMBERS)
    expect(decision).toEqual({
      ok: false,
      field: 'password',
      error: PASSWORD_SPECIAL_CHARACTER_MESSAGE,
    })
    if (!decision.ok) assertPasswordNotDisclosed(decision.error, LETTERS_AND_NUMBERS)
  })

  it('names each confirmed requirement that a password misses', () => {
    const shortDecision = preparePasswordResetSubmit(TOO_SHORT, TOO_SHORT)
    expect(shortDecision).toEqual({
      ok: false,
      field: 'password',
      error: PASSWORD_MIN_LENGTH_MESSAGE,
    })
    if (!shortDecision.ok) assertPasswordNotDisclosed(shortDecision.error, TOO_SHORT)

    const both = 'abc'
    const bothDecision = preparePasswordResetSubmit(both, both)
    expect(bothDecision).toEqual({
      ok: false,
      field: 'password',
      error: `${PASSWORD_MIN_LENGTH_MESSAGE} ${PASSWORD_SPECIAL_CHARACTER_MESSAGE}`,
    })
    if (!bothDecision.ok) assertPasswordNotDisclosed(bothDecision.error, both)
  })

  it('keeps a mismatched confirmation off the submit path', () => {
    const decision = preparePasswordResetSubmit(COMPLIANT, `${COMPLIANT}x`)
    expect(decision).toEqual({
      ok: false,
      field: 'confirm',
      error: 'Passwords do not match.',
    })
  })

  it('accepts a compliant password and matching confirmation', () => {
    expect(preparePasswordResetSubmit(COMPLIANT, COMPLIANT)).toEqual({ ok: true })
  })

  it('maps an Auth character-class rejection to the missing friendly rule', () => {
    const password = 'letters123!'
    const raw =
      'Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789:!@#$%^&*'
    const message = friendlyPasswordPolicyError(raw, password)
    expect(message).toBe(PASSWORD_UPPERCASE_MESSAGE)
    expect(message).not.toBe(raw)
    if (message) assertPasswordNotDisclosed(message, password)
  })

  it('shows the confirmed rules before submit without revealing a typed password', () => {
    const html = renderToStaticMarkup(createElement(ResetPasswordForm))
    expect(html).toContain('Create a password with:')
    expect(html).toContain('Not yet met: At least 8 characters')
    expect(html).toContain('Not yet met: A special character, such as ! @ # $ % ^ &amp; *')
    expect(html).toContain('aria-describedby="new-password-requirements"')
    expect(html).toContain('type="password"')
    expect(html).toContain('value=""')
    expect(html).not.toContain(LETTERS_AND_NUMBERS)
  })

  it('maps a letters-and-numbers Auth rejection to the special-character message', () => {
    const raw =
      'Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789:!@#$%^&*'
    const message = friendlyPasswordPolicyError(raw, LETTERS_AND_NUMBERS)
    expect(message).toContain(PASSWORD_SPECIAL_CHARACTER_MESSAGE)
    expect(message).not.toContain('There was an error processing your request')
    if (message) assertPasswordNotDisclosed(message, LETTERS_AND_NUMBERS)
  })
})
