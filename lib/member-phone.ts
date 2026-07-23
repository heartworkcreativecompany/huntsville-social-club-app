/**
 * US mobile phone helpers for Supabase Auth phone_change OTP.
 * Twilio (via Supabase SMS) requires strict E.164 — e.g. +16152901426.
 * Never pass raw 10-digit national numbers to Auth/Twilio.
 */

/** NANP US mobile: +1 + area code [2-9] + 7 digits. */
const US_E164_PATTERN = /^\+1[2-9]\d{9}$/

export const US_PHONE_INPUT_HINT =
  'US mobile numbers only. Enter 10 digits (e.g. 615 290 1426) — we send it as +1… E.164.'

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * Normalize user input to strict US E.164 (`+1XXXXXXXXXX`) or null.
 *
 * Accepted inputs:
 * - 10 digits → +1XXXXXXXXXX
 * - 11 digits starting with 1 → +1XXXXXXXXXX
 * - Already +1… (with or without formatting) if valid NANP
 */
export function normalizePhoneToE164(
  value: string,
  _defaultCountry: 'US' = 'US'
): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const digits = digitsOnly(trimmed)
  if (!digits) return null

  let candidate: string | null = null

  if (digits.length === 10) {
    candidate = `+1${digits}`
  } else if (digits.length === 11 && digits.startsWith('1')) {
    candidate = `+${digits}`
  } else {
    return null
  }

  return isStrictUsPhoneE164(candidate) ? candidate : null
}

/** True only for Twilio-safe US E.164 used by this app. */
export function isStrictUsPhoneE164(value: string | null | undefined): boolean {
  return Boolean(value && US_E164_PATTERN.test(value))
}

/**
 * Normalize + validate for Auth/Twilio. Prefer this at every OTP boundary.
 * Returns `{ e164 }` or `{ error }` — never a raw national number.
 */
export function requireUsPhoneE164(
  value: string
): { e164: string; error?: undefined } | { e164?: undefined; error: string } {
  const e164 = normalizePhoneToE164(value)
  if (!e164 || !isStrictUsPhoneE164(e164)) {
    return {
      error:
        'Enter a valid US mobile number with area code (10 digits). Example: 615 290 1426 → +16152901426.',
    }
  }
  return { e164 }
}

export function validatePhoneInput(value: string): string | null {
  const result = requireUsPhoneE164(value)
  return result.error ?? null
}

export function phonesMatchE164(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a || !b) return false
  const left = normalizePhoneToE164(a)
  const right = normalizePhoneToE164(b)
  return Boolean(left && right && left === right)
}

/** Display-friendly US format — never shown on public member profiles. */
export function formatPhoneForDisplay(e164: string | null | undefined): string {
  if (!e164) return ''
  const normalized = normalizePhoneToE164(e164)
  if (!normalized || !isStrictUsPhoneE164(normalized)) return e164
  const digits = normalized.slice(2)
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

/**
 * Map Supabase/Twilio phone OTP failures to member-facing copy.
 * Twilio 60200 = invalid `To` (often missing + / not E.164).
 */
export function friendlyPhoneOtpError(message: string): string {
  const lower = message.toLowerCase()
  if (
    lower.includes('60200') ||
    lower.includes('invalid parameter') ||
    lower.includes('invalid phone') ||
    lower.includes('invalid to')
  ) {
    return 'That phone number could not be sent. Use a US mobile number with area code (10 digits). We format it as +1… before texting.'
  }
  if (lower.includes('rate') || lower.includes('too many')) {
    return 'Too many attempts. Wait a minute, then try again.'
  }
  if (lower.includes('sms') || lower.includes('provider')) {
    return 'We could not send a text code right now. Check the number and try again, or try later.'
  }
  return message.trim() || 'Could not send a verification code. Try again.'
}
