/**
 * Optional SMS marketing consent (separate from one-time phone verification OTP).
 * Recurring event/club-update/promotional texts must check sms_marketing_opt_in.
 */

export const SMS_MARKETING_CONSENT_VERSION = '2026-08-18'

export const SMS_MARKETING_CONSENT_SOURCE =
  'membership_phone_verification_web' as const

/** Optional marketing checkbox must never be preselected. */
export const SMS_MARKETING_OPT_IN_DEFAULT_CHECKED = false

export const SMS_MARKETING_MAX_MESSAGES_PER_MONTH = 4

export const SMS_PROGRAM_NAME = 'Huntsville Social Club'

export const SMS_MARKETING_CONSENT_LINKS = {
  terms: '/terms',
  privacy: '/privacy',
} as const

export const PHONE_VERIFICATION_REQUIRED_COPY =
  'A verified mobile number is required to help protect member accounts and support secure membership access.'

export const SMS_MARKETING_CONSENT_LABEL =
  'Optional: I agree to receive recurring automated text messages from Huntsville Social Club about event reminders, club updates, and promotions at the number provided. Message frequency varies, up to 4 messages per month. Message and data rates may apply. Reply STOP to cancel or HELP for help. Consent is not a condition of membership or purchase. See Terms of Service and Privacy Policy.'

const STOP_KEYWORDS = new Set([
  'stop',
  'stopall',
  'unsubscribe',
  'cancel',
  'end',
  'quit',
])

export type SmsMarketingConsentRecord = {
  sms_marketing_opt_in: boolean
  sms_marketing_opt_in_at: string | null
  sms_marketing_consent_version: string | null
  sms_marketing_consent_source: string | null
  sms_marketing_consent_phone_e164: string | null
  sms_marketing_opted_out_at?: string | null
}

export type SmsMarketingConsentInput = {
  optedIn: boolean
  phoneE164: string
  nowIso?: string
  version?: string
  source?: string
}

/**
 * One-time verification OTP may be requested with a valid US number only.
 * Marketing opt-in is never required to send a verification code.
 */
export function canSendPhoneVerificationCode(input: {
  phoneDigits: string
  marketingOptInChecked?: boolean
}): boolean {
  const digits = input.phoneDigits.replace(/\D/g, '')
  return digits.length === 10
}

export function isEligibleForPromotionalSms(profile: {
  sms_marketing_opt_in?: boolean | null
  verified_phone_e164?: string | null
  sms_marketing_consent_phone_e164?: string | null
}): boolean {
  if (!profile.sms_marketing_opt_in) return false
  const phone =
    profile.verified_phone_e164 ?? profile.sms_marketing_consent_phone_e164
  return Boolean(phone)
}

export function isSmsStopKeyword(body: string): boolean {
  const normalized = body.trim().toLowerCase().replace(/[^a-z]/g, '')
  return STOP_KEYWORDS.has(normalized)
}

/**
 * Build the next marketing-consent profile patch.
 * Declining (optedIn=false) does not clear prior opt-in evidence during verification.
 * Affirmative opt-in preserves the original timestamp when version + phone are unchanged.
 */
export function nextSmsMarketingConsentState(
  existing: SmsMarketingConsentRecord | null | undefined,
  input: SmsMarketingConsentInput
): Partial<SmsMarketingConsentRecord> | null {
  if (!input.optedIn) {
    return null
  }

  const nowIso = input.nowIso ?? new Date().toISOString()
  const version = input.version ?? SMS_MARKETING_CONSENT_VERSION
  const source = input.source ?? SMS_MARKETING_CONSENT_SOURCE

  const sameActiveConsent =
    existing?.sms_marketing_opt_in === true &&
    existing.sms_marketing_consent_version === version &&
    existing.sms_marketing_consent_phone_e164 === input.phoneE164

  if (sameActiveConsent) {
    return null
  }

  return {
    sms_marketing_opt_in: true,
    sms_marketing_opt_in_at: nowIso,
    sms_marketing_consent_version: version,
    sms_marketing_consent_source: source,
    sms_marketing_consent_phone_e164: input.phoneE164,
    sms_marketing_opted_out_at: null,
  }
}

/**
 * STOP / unsubscribe: clear promotional eligibility.
 * Idempotent — duplicate STOPs keep opt_in false and preserve the first
 * sms_marketing_opted_out_at timestamp. Prior opt-in audit fields are kept.
 * Returns null when no profile write is needed.
 */
export function applySmsMarketingStop(
  existing: SmsMarketingConsentRecord | null | undefined,
  nowIso = new Date().toISOString()
): Partial<SmsMarketingConsentRecord> | null {
  const alreadyOptedOut =
    existing?.sms_marketing_opt_in === false &&
    Boolean(existing.sms_marketing_opted_out_at)

  if (alreadyOptedOut) {
    return null
  }

  return {
    sms_marketing_opt_in: false,
    sms_marketing_opted_out_at: existing?.sms_marketing_opted_out_at ?? nowIso,
    // Preserve prior opt-in audit fields when present.
    sms_marketing_opt_in_at: existing?.sms_marketing_opt_in_at ?? null,
    sms_marketing_consent_version:
      existing?.sms_marketing_consent_version ?? null,
    sms_marketing_consent_source:
      existing?.sms_marketing_consent_source ?? null,
    sms_marketing_consent_phone_e164:
      existing?.sms_marketing_consent_phone_e164 ?? null,
  }
}

/**
 * Gate for any future recurring/promotional SMS send path.
 * Throws when the member is not affirmatively opted in.
 */
export function assertCanSendPromotionalSms(profile: {
  sms_marketing_opt_in?: boolean | null
  verified_phone_e164?: string | null
  sms_marketing_consent_phone_e164?: string | null
}): void {
  if (!isEligibleForPromotionalSms(profile)) {
    throw new Error(
      'Member is not opted in to recurring SMS marketing messages.'
    )
  }
}
