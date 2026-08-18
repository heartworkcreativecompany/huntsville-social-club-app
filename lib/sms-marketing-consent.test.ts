import { describe, expect, it } from 'vitest'
import {
  applySmsMarketingStop,
  assertCanSendPromotionalSms,
  canSendPhoneVerificationCode,
  isEligibleForPromotionalSms,
  isSmsStopKeyword,
  nextSmsMarketingConsentState,
  PHONE_VERIFICATION_REQUIRED_COPY,
  SMS_MARKETING_CONSENT_LABEL,
  SMS_MARKETING_CONSENT_LINKS,
  SMS_MARKETING_CONSENT_SOURCE,
  SMS_MARKETING_CONSENT_VERSION,
  SMS_MARKETING_OPT_IN_DEFAULT_CHECKED,
} from '@/lib/sms-marketing-consent'
import {
  PRIVACY_MOBILE_NO_SHARE_STATEMENT,
  PRIVACY_MOBILE_SECTION_TITLE,
  privacyMobileSectionParagraphs,
} from '@/lib/privacy-mobile-copy'
import { MARKETING_BROWSER_ROUTES } from '@/lib/hostnames'

const EXAMPLE_E164 = '+13345550187'

describe('phone verification vs optional marketing consent UI rules', () => {
  it('keeps the marketing checkbox unchecked by default', () => {
    expect(SMS_MARKETING_OPT_IN_DEFAULT_CHECKED).toBe(false)
  })

  it('disables send without a valid 10-digit US number', () => {
    expect(canSendPhoneVerificationCode({ phoneDigits: '' })).toBe(false)
    expect(canSendPhoneVerificationCode({ phoneDigits: '334555018' })).toBe(
      false
    )
    expect(
      canSendPhoneVerificationCode({
        phoneDigits: '3345550187',
        marketingOptInChecked: false,
      })
    ).toBe(true)
  })

  it('allows verification send without marketing opt-in', () => {
    expect(
      canSendPhoneVerificationCode({
        phoneDigits: '3345550187',
        marketingOptInChecked: false,
      })
    ).toBe(true)
  })

  it('allows verification send when marketing is also checked', () => {
    expect(
      canSendPhoneVerificationCode({
        phoneDigits: '3345550187',
        marketingOptInChecked: true,
      })
    ).toBe(true)
  })

  it('includes Terms and Privacy links for consent copy', () => {
    expect(SMS_MARKETING_CONSENT_LABEL).toContain('Terms of Service')
    expect(SMS_MARKETING_CONSENT_LABEL).toContain('Privacy Policy')
    expect(SMS_MARKETING_CONSENT_LINKS.terms).toBe('/terms')
    expect(SMS_MARKETING_CONSENT_LINKS.privacy).toBe('/privacy')
    expect(MARKETING_BROWSER_ROUTES).toContain('/privacy')
    expect(MARKETING_BROWSER_ROUTES).toContain('/terms')
  })

  it('explains that verified mobile is required for account protection', () => {
    expect(PHONE_VERIFICATION_REQUIRED_COPY).toBe(
      'A verified mobile number is required to help protect member accounts and support secure membership access.'
    )
  })
})

describe('marketing consent persistence', () => {
  it('does not mark opted in when the checkbox is declined', () => {
    expect(
      nextSmsMarketingConsentState(null, {
        optedIn: false,
        phoneE164: EXAMPLE_E164,
      })
    ).toBeNull()
  })

  it('stores complete consent evidence on affirmative opt-in', () => {
    const now = '2026-08-18T15:00:00.000Z'
    expect(
      nextSmsMarketingConsentState(null, {
        optedIn: true,
        phoneE164: EXAMPLE_E164,
        nowIso: now,
      })
    ).toEqual({
      sms_marketing_opt_in: true,
      sms_marketing_opt_in_at: now,
      sms_marketing_consent_version: SMS_MARKETING_CONSENT_VERSION,
      sms_marketing_consent_source: SMS_MARKETING_CONSENT_SOURCE,
      sms_marketing_consent_phone_e164: EXAMPLE_E164,
      sms_marketing_opted_out_at: null,
    })
  })

  it('preserves prior opt-in evidence on same-version resend', () => {
    const existing = {
      sms_marketing_opt_in: true,
      sms_marketing_opt_in_at: '2026-08-01T12:00:00.000Z',
      sms_marketing_consent_version: SMS_MARKETING_CONSENT_VERSION,
      sms_marketing_consent_source: SMS_MARKETING_CONSENT_SOURCE,
      sms_marketing_consent_phone_e164: EXAMPLE_E164,
      sms_marketing_opted_out_at: null,
    }
    expect(
      nextSmsMarketingConsentState(existing, {
        optedIn: true,
        phoneE164: EXAMPLE_E164,
        nowIso: '2026-08-18T15:00:00.000Z',
      })
    ).toBeNull()
  })

  it('updates consent evidence when the consent version changes', () => {
    const existing = {
      sms_marketing_opt_in: true,
      sms_marketing_opt_in_at: '2026-08-01T12:00:00.000Z',
      sms_marketing_consent_version: '2026-01-01',
      sms_marketing_consent_source: SMS_MARKETING_CONSENT_SOURCE,
      sms_marketing_consent_phone_e164: EXAMPLE_E164,
      sms_marketing_opted_out_at: null,
    }
    const next = nextSmsMarketingConsentState(existing, {
      optedIn: true,
      phoneE164: EXAMPLE_E164,
      nowIso: '2026-08-18T15:00:00.000Z',
    })
    expect(next?.sms_marketing_opt_in_at).toBe('2026-08-18T15:00:00.000Z')
    expect(next?.sms_marketing_consent_version).toBe(
      SMS_MARKETING_CONSENT_VERSION
    )
  })
})

describe('promotional send eligibility', () => {
  it('is false without marketing opt-in (verification alone is not enough)', () => {
    expect(
      isEligibleForPromotionalSms({
        sms_marketing_opt_in: false,
        verified_phone_e164: EXAMPLE_E164,
      })
    ).toBe(false)
    expect(() =>
      assertCanSendPromotionalSms({
        sms_marketing_opt_in: false,
        verified_phone_e164: EXAMPLE_E164,
      })
    ).toThrow(/not opted in/i)
  })

  it('is true only after affirmative opt-in with a phone on file', () => {
    expect(
      isEligibleForPromotionalSms({
        sms_marketing_opt_in: true,
        verified_phone_e164: EXAMPLE_E164,
      })
    ).toBe(true)
    expect(() =>
      assertCanSendPromotionalSms({
        sms_marketing_opt_in: true,
        verified_phone_e164: EXAMPLE_E164,
      })
    ).not.toThrow()
  })

  it('STOP/unsubscribe removes promotional-send eligibility', () => {
    expect(isSmsStopKeyword('STOP')).toBe(true)
    expect(isSmsStopKeyword('STOPALL')).toBe(true)
    expect(isSmsStopKeyword('UNSUBSCRIBE')).toBe(true)
    expect(isSmsStopKeyword('CANCEL')).toBe(true)
    expect(isSmsStopKeyword('END')).toBe(true)
    expect(isSmsStopKeyword('QUIT')).toBe(true)
    expect(isSmsStopKeyword('hello')).toBe(false)

    const stopped = applySmsMarketingStop(
      {
        sms_marketing_opt_in: true,
        sms_marketing_opt_in_at: '2026-08-01T12:00:00.000Z',
        sms_marketing_consent_version: SMS_MARKETING_CONSENT_VERSION,
        sms_marketing_consent_source: SMS_MARKETING_CONSENT_SOURCE,
        sms_marketing_consent_phone_e164: EXAMPLE_E164,
        sms_marketing_opted_out_at: null,
      },
      '2026-08-18T16:00:00.000Z'
    )

    expect(stopped).not.toBeNull()
    expect(stopped?.sms_marketing_opt_in).toBe(false)
    expect(stopped?.sms_marketing_opted_out_at).toBe('2026-08-18T16:00:00.000Z')
    expect(stopped?.sms_marketing_opt_in_at).toBe('2026-08-01T12:00:00.000Z')
    expect(
      isEligibleForPromotionalSms({
        ...stopped,
        verified_phone_e164: EXAMPLE_E164,
      })
    ).toBe(false)
  })

  it('duplicate STOP is idempotent and preserves the first opt-out timestamp', () => {
    const first = applySmsMarketingStop(
      {
        sms_marketing_opt_in: true,
        sms_marketing_opt_in_at: '2026-08-01T12:00:00.000Z',
        sms_marketing_consent_version: SMS_MARKETING_CONSENT_VERSION,
        sms_marketing_consent_source: SMS_MARKETING_CONSENT_SOURCE,
        sms_marketing_consent_phone_e164: EXAMPLE_E164,
        sms_marketing_opted_out_at: null,
      },
      '2026-08-18T16:00:00.000Z'
    )

    const duplicate = applySmsMarketingStop(
      {
        sms_marketing_opt_in: false,
        sms_marketing_opt_in_at: '2026-08-01T12:00:00.000Z',
        sms_marketing_consent_version: SMS_MARKETING_CONSENT_VERSION,
        sms_marketing_consent_source: SMS_MARKETING_CONSENT_SOURCE,
        sms_marketing_consent_phone_e164: EXAMPLE_E164,
        sms_marketing_opted_out_at: first?.sms_marketing_opted_out_at ?? null,
      },
      '2026-08-19T10:00:00.000Z'
    )

    expect(duplicate).toBeNull()
    expect(
      isEligibleForPromotionalSms({
        sms_marketing_opt_in: false,
        verified_phone_e164: EXAMPLE_E164,
        sms_marketing_consent_phone_e164: EXAMPLE_E164,
      })
    ).toBe(false)
  })
})

describe('privacy policy mobile SMS section', () => {
  it('renders the section title and no-sharing statement', () => {
    expect(PRIVACY_MOBILE_SECTION_TITLE).toBe(
      'Mobile Numbers and Text Messages'
    )
    expect(PRIVACY_MOBILE_NO_SHARE_STATEMENT).toContain(
      'will not be shared with third parties or affiliates for their own marketing or promotional purposes'
    )
    expect(privacyMobileSectionParagraphs.join('\n')).toContain(
      PRIVACY_MOBILE_NO_SHARE_STATEMENT
    )
    expect(privacyMobileSectionParagraphs.join('\n')).toMatch(
      /optional/i
    )
    expect(privacyMobileSectionParagraphs.join('\n')).toMatch(/STOP/)
    expect(privacyMobileSectionParagraphs.join('\n')).toMatch(/HELP/)
  })
})
