import { describe, expect, it } from 'vitest'
import {
  formatPhoneForDisplay,
  friendlyPhoneOtpError,
  isStrictUsPhoneE164,
  normalizePhoneToE164,
  phonesMatchE164,
  requireUsPhoneE164,
  validatePhoneInput,
} from '@/lib/member-phone'

describe('normalizePhoneToE164', () => {
  it('converts exactly 10 digits to +1XXXXXXXXXX', () => {
    expect(normalizePhoneToE164('6152901426')).toBe('+16152901426')
    expect(normalizePhoneToE164('2565550100')).toBe('+12565550100')
  })

  it('accepts formatted 10-digit national numbers', () => {
    expect(normalizePhoneToE164('(615) 290-1426')).toBe('+16152901426')
    expect(normalizePhoneToE164('615-290-1426')).toBe('+16152901426')
    expect(normalizePhoneToE164('615 290 1426')).toBe('+16152901426')
  })

  it('converts 11 digits starting with 1 to +1XXXXXXXXXX', () => {
    expect(normalizePhoneToE164('16152901426')).toBe('+16152901426')
    expect(normalizePhoneToE164('1 (615) 290-1426')).toBe('+16152901426')
  })

  it('preserves valid +1 E.164', () => {
    expect(normalizePhoneToE164('+16152901426')).toBe('+16152901426')
    expect(normalizePhoneToE164('+1 615 290 1426')).toBe('+16152901426')
  })

  it('treats +615… (missing country code) as 10-digit US national', () => {
    // Digits-only path: +6152901426 → 6152901426 → +16152901426
    expect(normalizePhoneToE164('+6152901426')).toBe('+16152901426')
  })

  it('rejects invalid lengths and non-NANP area codes', () => {
    expect(normalizePhoneToE164('123')).toBeNull()
    expect(normalizePhoneToE164('615290142')).toBeNull()
    expect(normalizePhoneToE164('06152901426')).toBeNull()
    // Area code cannot start with 0 or 1
    expect(normalizePhoneToE164('0152901426')).toBeNull()
    expect(normalizePhoneToE164('1152901426')).toBeNull()
  })
})

describe('isStrictUsPhoneE164', () => {
  it('accepts only +1 + NANP', () => {
    expect(isStrictUsPhoneE164('+16152901426')).toBe(true)
    expect(isStrictUsPhoneE164('6152901426')).toBe(false)
    expect(isStrictUsPhoneE164('+441234567890')).toBe(false)
  })
})

describe('requireUsPhoneE164', () => {
  it('returns e164 for valid input', () => {
    expect(requireUsPhoneE164('6152901426')).toEqual({
      e164: '+16152901426',
    })
  })

  it('returns a friendly error for invalid input', () => {
    const result = requireUsPhoneE164('123')
    expect(result.e164).toBeUndefined()
    expect(result.error).toMatch(/US mobile/i)
  })
})

describe('validatePhoneInput', () => {
  it('accepts valid US mobile numbers', () => {
    expect(validatePhoneInput('6152901426')).toBeNull()
    expect(validatePhoneInput('+16152901426')).toBeNull()
  })

  it('rejects invalid numbers', () => {
    expect(validatePhoneInput('123')).not.toBeNull()
    expect(validatePhoneInput('0152901426')).not.toBeNull()
  })
})

describe('phonesMatchE164', () => {
  it('matches formatted and E.164 values', () => {
    expect(phonesMatchE164('6152901426', '+16152901426')).toBe(true)
    expect(phonesMatchE164('(615) 290-1426', '16152901426')).toBe(true)
  })
})

describe('formatPhoneForDisplay', () => {
  it('formats verified numbers for account UI', () => {
    expect(formatPhoneForDisplay('+16152901426')).toBe('(615) 290-1426')
  })
})

describe('friendlyPhoneOtpError', () => {
  it('maps Twilio 60200 / invalid parameter to clear copy', () => {
    expect(
      friendlyPhoneOtpError(
        'Error sending phone_change OTP to provider: Invalid parameter'
      )
    ).toMatch(/US mobile/i)
    expect(friendlyPhoneOtpError('Twilio error 60200')).toMatch(/US mobile/i)
  })
})
