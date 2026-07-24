/**
 * US mobile phone helpers for Supabase Auth phone_change OTP.
 * Twilio (via Supabase SMS) requires strict E.164 — e.g. +13345550187.
 * Never pass raw 10-digit national numbers to Auth/Twilio.
 */

/** NANP US mobile: +1 + area code [2-9] + 7 digits. */
const US_E164_PATTERN = /^\+1[2-9]\d{9}$/

/** Placeholder for the phone input (generic 555 example — not a real member number). */
export const US_PHONE_INPUT_PLACEHOLDER = 'e.g. (334) 555-0187'

export const US_PHONE_INPUT_HINT =
  'US mobile numbers only. Enter 10 digits and we’ll format it as +1... before texting.'

/** Member-facing message when SMS/OTP send fails (never expose provider codes). */
export const PHONE_OTP_SEND_FAILED_MESSAGE =
  'We couldn’t send a code to that number. Enter a valid US mobile number and try again.'

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
        'Enter a valid US mobile number with area code (10 digits). Example: (334) 555-0187.',
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

/** Mask for logs: +1334****0187 */
export function maskPhoneE164ForLog(e164: string): string {
  if (!isStrictUsPhoneE164(e164)) return '[invalid-or-unset]'
  return `${e164.slice(0, 5)}****${e164.slice(-4)}`
}

export type PhoneOtpDebugStage =
  | 'validation'
  | 'provider_send'
  | 'provider_verify'
  | 'assert_e164'

/** Debug-only logging — never show raw provider errors in the UI. */
export function logPhoneOtpDebug(
  stage: PhoneOtpDebugStage,
  details: {
    e164?: string | null
    resend?: boolean
    errorMessage?: string | null
    errorCode?: string | number | null
    note?: string
  }
): void {
  const masked =
    details.e164 != null ? maskPhoneE164ForLog(details.e164) : undefined
  console.error('[phone-otp]', {
    stage,
    maskedE164: masked,
    resend: details.resend,
    errorMessage: details.errorMessage ?? undefined,
    errorCode: details.errorCode ?? undefined,
    note: details.note,
  })
}

/**
 * Map Supabase/Twilio phone OTP failures to member-facing copy.
 * Never surface Twilio error codes or raw provider messages.
 */
export function friendlyPhoneOtpError(
  _message: string,
  kind: 'send' | 'verify' = 'send'
): string {
  if (kind === 'verify') {
    return 'That code could not be verified. Check the 6-digit code and try again.'
  }
  return PHONE_OTP_SEND_FAILED_MESSAGE
}
