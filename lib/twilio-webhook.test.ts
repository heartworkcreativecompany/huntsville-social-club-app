import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import twilio from 'twilio'
import {
  applySmsMarketingStop,
  isEligibleForAccountNotificationSms,
  isSmsStopKeyword,
  SMS_ACCOUNT_NOTIFICATIONS_CONSENT_SOURCE,
  SMS_ACCOUNT_NOTIFICATIONS_CONSENT_VERSION,
} from '@/lib/sms-marketing-consent'
import {
  isValidTwilioRequestSignature,
  resolveTwilioWebhookPublicUrl,
  twilioWebhookSecurityLog,
} from '@/lib/twilio-webhook'

const ORIGINAL = { ...process.env }
const AUTH_TOKEN = 'test_twilio_auth_token_for_unit_tests_only'
const WEBHOOK_URL =
  'https://members.huntsvillesocialclub.com/api/sms/inbound'
const EXAMPLE_E164 = '+13345550187'

afterEach(() => {
  process.env = { ...ORIGINAL }
})

function signTwilioRequest(
  authToken: string,
  url: string,
  params: Record<string, string>
): string {
  // Mirror Twilio's documented HMAC-SHA1 construction for unit tests.
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url)
  return createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64')
}

describe('resolveTwilioWebhookPublicUrl', () => {
  it('prefers the configured members production origin', () => {
    process.env.NEXT_PUBLIC_MEMBERS_URL =
      'https://members.huntsvillesocialclub.com'
    process.env.NEXT_PUBLIC_APP_URL = 'https://members.huntsvillesocialclub.com'
    expect(
      resolveTwilioWebhookPublicUrl({
        pathname: '/api/sms/inbound',
        forwardedProto: 'https',
        forwardedHost: 'something-else.vercel.app',
        host: 'something-else.vercel.app',
      })
    ).toBe(WEBHOOK_URL)
  })

  it('reconstructs from trusted proxy headers when origin is localhost', () => {
    process.env.NEXT_PUBLIC_MEMBERS_URL = 'http://localhost:3000'
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
    expect(
      resolveTwilioWebhookPublicUrl({
        pathname: '/api/sms/inbound',
        search: '',
        forwardedProto: 'https',
        forwardedHost: 'members.huntsvillesocialclub.com',
        host: 'localhost:3000',
      })
    ).toBe(WEBHOOK_URL)
  })
})

describe('Twilio webhook signature validation', () => {
  it('accepts a valid signed STOP request (official validateRequest)', () => {
    const params = {
      From: EXAMPLE_E164,
      Body: 'STOP',
      To: '+12565550100',
      MessageSid: 'SMxxxxxxxx',
      AccountSid: 'ACxxxxxxxx',
    }
    const signature = signTwilioRequest(AUTH_TOKEN, WEBHOOK_URL, params)

    expect(
      twilio.validateRequest(AUTH_TOKEN, signature, WEBHOOK_URL, params)
    ).toBe(true)
    expect(
      isValidTwilioRequestSignature({
        authToken: AUTH_TOKEN,
        signature,
        url: WEBHOOK_URL,
        params,
      })
    ).toBe(true)
    expect(isSmsStopKeyword(params.Body)).toBe(true)

    const optedOut = applySmsMarketingStop(
      {
        sms_marketing_opt_in: true,
        sms_marketing_opt_in_at: '2026-08-01T12:00:00.000Z',
        sms_marketing_consent_version: SMS_ACCOUNT_NOTIFICATIONS_CONSENT_VERSION,
        sms_marketing_consent_source: SMS_ACCOUNT_NOTIFICATIONS_CONSENT_SOURCE,
        sms_marketing_consent_phone_e164: EXAMPLE_E164,
        sms_marketing_opted_out_at: null,
      },
      '2026-08-18T16:00:00.000Z'
    )

    expect(optedOut?.sms_marketing_opt_in).toBe(false)
    expect(
      isEligibleForAccountNotificationSms({
        sms_marketing_opt_in: false,
        verified_phone_e164: EXAMPLE_E164,
      })
    ).toBe(false)
  })

  it('rejects an invalid signature so consent cannot be altered', () => {
    const params = {
      From: EXAMPLE_E164,
      Body: 'STOP',
    }
    const valid = isValidTwilioRequestSignature({
      authToken: AUTH_TOKEN,
      signature: 'not-a-real-signature',
      url: WEBHOOK_URL,
      params,
    })
    expect(valid).toBe(false)

    // Handler must refuse before calling opt-out — model the gate explicitly.
    const shouldMutateConsent = valid && isSmsStopKeyword(params.Body)
    expect(shouldMutateConsent).toBe(false)
  })

  it('rejects a missing signature', () => {
    expect(
      isValidTwilioRequestSignature({
        authToken: AUTH_TOKEN,
        signature: null,
        url: WEBHOOK_URL,
        params: { From: EXAMPLE_E164, Body: 'STOP' },
      })
    ).toBe(false)
  })

  it('keeps account-notification eligibility false after a duplicate valid STOP', () => {
    const firstOptOutAt = '2026-08-18T16:00:00.000Z'
    const afterFirst = applySmsMarketingStop(
      {
        sms_marketing_opt_in: true,
        sms_marketing_opt_in_at: '2026-08-01T12:00:00.000Z',
        sms_marketing_consent_version: SMS_ACCOUNT_NOTIFICATIONS_CONSENT_VERSION,
        sms_marketing_consent_source: SMS_ACCOUNT_NOTIFICATIONS_CONSENT_SOURCE,
        sms_marketing_consent_phone_e164: EXAMPLE_E164,
        sms_marketing_opted_out_at: null,
      },
      firstOptOutAt
    )

    const afterDuplicate = applySmsMarketingStop(
      {
        sms_marketing_opt_in: false,
        sms_marketing_opt_in_at: '2026-08-01T12:00:00.000Z',
        sms_marketing_consent_version: SMS_ACCOUNT_NOTIFICATIONS_CONSENT_VERSION,
        sms_marketing_consent_source: SMS_ACCOUNT_NOTIFICATIONS_CONSENT_SOURCE,
        sms_marketing_consent_phone_e164: EXAMPLE_E164,
        sms_marketing_opted_out_at: afterFirst?.sms_marketing_opted_out_at,
      },
      '2026-08-20T12:00:00.000Z'
    )

    expect(afterFirst?.sms_marketing_opted_out_at).toBe(firstOptOutAt)
    expect(afterDuplicate).toBeNull()
    expect(
      isEligibleForAccountNotificationSms({
        sms_marketing_opt_in: false,
        verified_phone_e164: EXAMPLE_E164,
      })
    ).toBe(false)
  })

  it('security logs never include secrets or message PII fields', () => {
    const log = twilioWebhookSecurityLog({
      accepted: false,
      reason: 'invalid_signature',
      hasSignature: true,
    })
    expect(log).toEqual({
      event: 'twilio_sms_inbound',
      accepted: false,
      reason: 'invalid_signature',
      hasSignature: true,
    })
    expect(JSON.stringify(log)).not.toMatch(/auth|token|signature=|Body|From|\+1/i)
  })
})
