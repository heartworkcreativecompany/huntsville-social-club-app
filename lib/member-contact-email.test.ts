import { describe, expect, it } from 'vitest'
import {
  normalizeContactEmailInput,
  publicContactEmail,
  validateContactEmailInput,
} from '@/lib/member-contact-email'

describe('publicContactEmail', () => {
  it('returns null when visibility is off', () => {
    expect(
      publicContactEmail({
        contact_email: 'hello@example.com',
        show_contact_email: false,
      })
    ).toBeNull()
  })

  it('returns null when visibility is on but email is blank', () => {
    expect(
      publicContactEmail({
        contact_email: '   ',
        show_contact_email: true,
      })
    ).toBeNull()
  })

  it('returns trimmed email when opted in', () => {
    expect(
      publicContactEmail({
        contact_email: '  hello@example.com ',
        show_contact_email: true,
      })
    ).toBe('hello@example.com')
  })
})

describe('validateContactEmailInput', () => {
  it('allows blank contact email', () => {
    expect(validateContactEmailInput('')).toBeNull()
  })

  it('rejects invalid email', () => {
    expect(validateContactEmailInput('not-an-email')).toBeTruthy()
  })
})

describe('normalizeContactEmailInput', () => {
  it('normalizes blank to null', () => {
    expect(normalizeContactEmailInput('   ')).toBeNull()
  })
})
