import { describe, expect, it } from 'vitest'
import {
  formatPhoneForDisplay,
  normalizePhoneToE164,
  phonesMatchE164,
  validatePhoneInput,
} from '@/lib/member-phone'

describe('normalizePhoneToE164', () => {
  it('normalizes US numbers to E.164', () => {
    expect(normalizePhoneToE164('2565550100')).toBe('+12565550100')
    expect(normalizePhoneToE164('(256) 555-0100')).toBe('+12565550100')
    expect(normalizePhoneToE164('+12565550100')).toBe('+12565550100')
  })
})

describe('validatePhoneInput', () => {
  it('accepts valid US mobile numbers', () => {
    expect(validatePhoneInput('2565550100')).toBeNull()
  })

  it('rejects invalid numbers', () => {
    expect(validatePhoneInput('123')).not.toBeNull()
  })
})

describe('phonesMatchE164', () => {
  it('matches formatted and E.164 values', () => {
    expect(phonesMatchE164('2565550100', '+12565550100')).toBe(true)
  })
})

describe('formatPhoneForDisplay', () => {
  it('formats verified numbers for account UI', () => {
    expect(formatPhoneForDisplay('+12565550100')).toBe('(256) 555-0100')
  })
})
