import { describe, expect, it } from 'vitest'
import {
  formatPhoneForDisplay,
  friendlyPhoneOtpError,
  isStrictUsPhoneE164,
  maskPhoneE164ForLog,
  normalizePhoneToE164,
  phonesMatchE164,
  PHONE_OTP_SEND_FAILED_MESSAGE,
  requireUsPhoneE164,
  US_PHONE_INPUT_HINT,
  US_PHONE_INPUT_PLACEHOLDER,
  validatePhoneInput,
} from '@/lib/member-phone'

/** Generic 555 example used in UI/docs — not a real member number. */
const EXAMPLE_NATIONAL = '3345550187'
const EXAMPLE_E164 = '+13345550187'

describe('phone UX copy', () => {
  it('uses the approved placeholder and helper strings', () => {
    expect(US_PHONE_INPUT_PLACEHOLDER).toBe('e.g. (334) 555-0187')
    expect(US_PHONE_INPUT_HINT).toBe(
      'US mobile numbers only. Enter 10 digits and we’ll format it as +1... before texting.'
    )
    expect(PHONE_OTP_SEND_FAILED_MESSAGE).toBe(
      'We couldn’t send a code to that number. Enter a valid US mobile number and try again.'
    )
  })
})

describe('normalizePhoneToE164', () => {
  it('converts exactly 10 digits to +1XXXXXXXXXX', () => {
    expect(normalizePhoneToE164(EXAMPLE_NATIONAL)).toBe(EXAMPLE_E164)
    expect(normalizePhoneToE164('2565550100')).toBe('+12565550100')
  })

  it('accepts formatted 10-digit national numbers', () => {
    expect(normalizePhoneToE164('(334) 555-0187')).toBe(EXAMPLE_E164)
    expect(normalizePhoneToE164('334-555-0187')).toBe(EXAMPLE_E164)
    expect(normalizePhoneToE164('334 555 0187')).toBe(EXAMPLE_E164)
  })

  it('converts 11 digits starting with 1 to +1XXXXXXXXXX', () => {
    expect(normalizePhoneToE164('13345550187')).toBe(EXAMPLE_E164)
    expect(normalizePhoneToE164('1 (334) 555-0187')).toBe(EXAMPLE_E164)
  })

  it('preserves valid +1 E.164', () => {
    expect(normalizePhoneToE164(EXAMPLE_E164)).toBe(EXAMPLE_E164)
    expect(normalizePhoneToE164('+1 334 555 0187')).toBe(EXAMPLE_E164)
  })

  it('treats +334… (missing country code) as 10-digit US national', () => {
    expect(normalizePhoneToE164('+3345550187')).toBe(EXAMPLE_E164)
  })

  it('rejects invalid lengths and non-NANP area codes', () => {
    expect(normalizePhoneToE164('123')).toBeNull()
    expect(normalizePhoneToE164('334555018')).toBeNull()
    expect(normalizePhoneToE164('03345550187')).toBeNull()
    expect(normalizePhoneToE164('0155550100')).toBeNull()
    expect(normalizePhoneToE164('1155550100')).toBeNull()
  })
})

describe('isStrictUsPhoneE164', () => {
  it('accepts only +1 + NANP', () => {
    expect(isStrictUsPhoneE164(EXAMPLE_E164)).toBe(true)
    expect(isStrictUsPhoneE164(EXAMPLE_NATIONAL)).toBe(false)
    expect(isStrictUsPhoneE164('+441234567890')).toBe(false)
  })
})

describe('requireUsPhoneE164', () => {
  it('returns e164 for valid input', () => {
    expect(requireUsPhoneE164(EXAMPLE_NATIONAL)).toEqual({
      e164: EXAMPLE_E164,
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
    expect(validatePhoneInput(EXAMPLE_NATIONAL)).toBeNull()
    expect(validatePhoneInput(EXAMPLE_E164)).toBeNull()
  })

  it('rejects invalid numbers', () => {
    expect(validatePhoneInput('123')).not.toBeNull()
    expect(validatePhoneInput('0155550100')).not.toBeNull()
  })
})

describe('phonesMatchE164', () => {
  it('matches formatted and E.164 values', () => {
    expect(phonesMatchE164(EXAMPLE_NATIONAL, EXAMPLE_E164)).toBe(true)
    expect(phonesMatchE164('(334) 555-0187', '13345550187')).toBe(true)
  })
})

describe('formatPhoneForDisplay', () => {
  it('formats verified numbers for account UI', () => {
    expect(formatPhoneForDisplay(EXAMPLE_E164)).toBe('(334) 555-0187')
  })
})

describe('maskPhoneE164ForLog', () => {
  it('masks middle digits', () => {
    expect(maskPhoneE164ForLog(EXAMPLE_E164)).toBe('+1334****0187')
  })
})

describe('friendlyPhoneOtpError', () => {
  it('never exposes provider codes to users', () => {
    expect(
      friendlyPhoneOtpError(
        'Error sending phone_change OTP to provider: Invalid parameter',
        'send'
      )
    ).toBe(PHONE_OTP_SEND_FAILED_MESSAGE)
    expect(friendlyPhoneOtpError('Twilio error 60200', 'send')).toBe(
      PHONE_OTP_SEND_FAILED_MESSAGE
    )
    expect(friendlyPhoneOtpError('Token expired', 'verify')).toMatch(
      /could not be verified/i
    )
  })
})
