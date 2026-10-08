import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  EMAIL_MARKETING_CONSENT_VERSION,
  EMAIL_MARKETING_OPT_IN_LABEL,
  ESSENTIAL_EMAIL_ACKNOWLEDGEMENT_LABEL,
  ESSENTIAL_EMAIL_ACKNOWLEDGEMENT_VERSION,
  privacyEmailSectionParagraphs,
  signupEmailConsentMetadata,
} from '@/lib/email-consent'
import {
  decideEmailMarketingSync,
  marketingSubscriptionBody,
  nextMarketingSyncDelaySeconds,
  runEmailMarketingSyncAttempt,
} from '@/lib/email-marketing-sync'
import {
  handleResendContactWebhook,
  resendContactResubscribeEmail,
  resendContactUnsubscribeEmail,
  type ResubscribeReconciliation,
} from '@/lib/resend-contact-webhook'
import { verifyResendWebhookSignature } from '@/lib/resend-webhook-signature'
import { isMemberPubliclyVerified } from '@/lib/membership-systems'
import { PRIVACY_POLICY_LAST_UPDATED } from '@/lib/privacy-mobile-copy'

const repoRoot = process.cwd()
const testSecret = `whsec_${Buffer.from('signup-consent-test-secret').toString('base64')}`

function reconcileIgnored(): Promise<ResubscribeReconciliation> {
  return Promise.resolve('ignored')
}

function sign(payload: string, timestamp: string, id = 'msg_test') {
  const key = Buffer.from(testSecret.slice('whsec_'.length), 'base64')
  const digest = createHmac('sha256', key)
    .update(`${id}.${timestamp}.${payload}`)
    .digest('base64')
  return { id, timestamp, signature: `v1,${digest}` }
}

describe('signup email consent metadata', () => {
  it('sends only the two booleans and keeps both unchecked values false', () => {
    expect(
      signupEmailConsentMetadata({
        essentialAcknowledged: false,
        marketingOptIn: false,
      })
    ).toEqual({
      essential_email_acknowledgement: false,
      email_marketing_opt_in: false,
    })
  })

  it('does not treat essential acknowledgement as marketing opt-in', () => {
    expect(
      signupEmailConsentMetadata({
        essentialAcknowledged: true,
        marketingOptIn: false,
      })
    ).toEqual({
      essential_email_acknowledgement: true,
      email_marketing_opt_in: false,
    })
  })

  it('uses the approved public checkbox sentences', () => {
    expect(ESSENTIAL_EMAIL_ACKNOWLEDGEMENT_LABEL).toBe(
      'I understand and agree that Huntsville Social Club will send emails necessary to manage my application, account, and membership.'
    )
    expect(EMAIL_MARKETING_OPT_IN_LABEL).toBe(
      'Email me Huntsville Social Club news, event announcements, and offers. Optional—you can unsubscribe at any time.'
    )
  })
})

describe('signup form source', () => {
  const signup = readFileSync(resolve(repoRoot, 'app/signup/page.tsx'), 'utf8')
  const phoneCard = readFileSync(
    resolve(repoRoot, 'components/profile/profile-phone-verification-card.tsx'),
    'utf8'
  )
  const statusHandler = readFileSync(
    resolve(
      repoRoot,
      'supabase/functions/application-status-email/handler.ts'
    ),
    'utf8'
  )

  it('keeps Auth signup and sends consent booleans without client evidence fields', () => {
    expect(signup).toContain('await supabase.auth.signUp({')
    expect(signup).toContain('signupEmailConsentMetadata')
    expect(signup).toContain('useState(false)')
    expect(signup).not.toContain('essential_email_acknowledged_at')
    expect(signup).not.toContain('essential_email_acknowledgement_source')
    expect(signup).not.toContain(ESSENTIAL_EMAIL_ACKNOWLEDGEMENT_VERSION)
    expect(signup).not.toContain(EMAIL_MARKETING_CONSENT_VERSION)
  })

  it('removes the SMS consent checkbox from phone verification', () => {
    expect(phoneCard).not.toContain('SMS_ACCOUNT_NOTIFICATIONS_CONSENT_LABEL')
    expect(phoneCard).not.toContain('recordSmsAccountNotificationsConsent')
    expect(phoneCard).toContain('requestPhoneChangeOtp')
  })

  it('creates a missing status contact unsubscribed and does not resubscribe an existing one', () => {
    expect(statusHandler).toContain('unsubscribed: true')
    expect(statusHandler).not.toContain('unsubscribed: false')
    expect(statusHandler).toContain('JSON.stringify({ first_name: firstName })')
  })
})

describe('public privacy wording', () => {
  it('states the proposed publication date and does not promise essential-mail separation', () => {
    expect(PRIVACY_POLICY_LAST_UPDATED).toBe('October 7, 2026')
    const copy = privacyEmailSectionParagraphs.join('\n')
    expect(copy).toContain('That acknowledgement is not a request for news or offers.')
    expect(copy).toContain('You can unsubscribe from news, announcements, and offers.')
    expect(copy).not.toMatch(/does not stop essential/i)
    expect(copy).not.toMatch(/cannot affect essential/i)
  })
})

describe('resend webhook signatures', () => {
  const now = 1_700_000_000

  it('verifies the raw body and rejects a re-serialized payload', () => {
    const raw =
      '{"type": "contact.updated", "data": {"email": "a@example.com", "unsubscribed": true}}'
    const signed = sign(raw, String(now))
    expect(
      verifyResendWebhookSignature({
        payload: raw,
        svixId: signed.id,
        svixTimestamp: signed.timestamp,
        svixSignature: signed.signature,
        secret: testSecret,
        nowSeconds: now,
      })
    ).toBe(true)

    const reparsed = JSON.stringify(JSON.parse(raw))
    expect(reparsed).not.toBe(raw)
    expect(
      verifyResendWebhookSignature({
        payload: reparsed,
        svixId: signed.id,
        svixTimestamp: signed.timestamp,
        svixSignature: signed.signature,
        secret: testSecret,
        nowSeconds: now,
      })
    ).toBe(false)
  })

  it('does not write when the signature is invalid', async () => {
    let writes = 0
    const raw = '{"type":"contact.updated","data":{"email":"a@example.com","unsubscribed":true}}'
    const result = await handleResendContactWebhook({
      rawBody: raw,
      svixId: 'msg_bad',
      svixTimestamp: String(now),
      svixSignature: 'v1,not-a-real-signature',
      secret: testSecret,
      nowSeconds: now,
      applyUnsubscribe: async () => {
        writes += 1
        return 'applied'
      },
      reconcileResubscribe: async () => {
        writes += 1
        return 'correction_queued'
      },
      recordDelivery: async () => {
        writes += 1
        return 'new'
      },
    })
    expect(result.status).toBe(400)
    expect(writes).toBe(0)
  })

  it('persists a duplicate unsubscribe without treating unsubscribed false as opt-in', async () => {
    const raw = '{"type":"contact.updated","data":{"email":"a@example.com","unsubscribed":true}}'
    const signed = sign(raw, String(now))
    let applies = 0
    const first = await handleResendContactWebhook({
      rawBody: raw,
      svixId: signed.id,
      svixTimestamp: signed.timestamp,
      svixSignature: signed.signature,
      secret: testSecret,
      nowSeconds: now,
      applyUnsubscribe: async () => {
        applies += 1
        return applies === 1 ? 'applied' : 'duplicate'
      },
      reconcileResubscribe: reconcileIgnored,
      recordDelivery: async () => 'new',
    })
    const second = await handleResendContactWebhook({
      rawBody: raw,
      svixId: signed.id,
      svixTimestamp: signed.timestamp,
      svixSignature: signed.signature,
      secret: testSecret,
      nowSeconds: now,
      applyUnsubscribe: async () => 'duplicate',
      reconcileResubscribe: reconcileIgnored,
      recordDelivery: async () => 'new',
    })
    expect(first.body.duplicate).toBe(false)
    expect(second.body.duplicate).toBe(true)

    const optedBackIn = '{"type":"contact.updated","data":{"email":"a@example.com","unsubscribed":false}}'
    expect(resendContactUnsubscribeEmail(JSON.parse(optedBackIn))).toBeNull()
    const falseSigned = sign(optedBackIn, String(now), 'msg_false')
    let applyCalled = false
    let recorded = 0
    let reconciled = 0
    const correction = await handleResendContactWebhook({
      rawBody: optedBackIn,
      svixId: falseSigned.id,
      svixTimestamp: falseSigned.timestamp,
      svixSignature: falseSigned.signature,
      secret: testSecret,
      nowSeconds: now,
      applyUnsubscribe: async () => {
        applyCalled = true
        return 'applied'
      },
      reconcileResubscribe: async () => {
        reconciled += 1
        return 'correction_queued'
      },
      recordDelivery: async () => {
        recorded += 1
        return 'new'
      },
    })
    expect(correction.body.correction).toBe('correction_queued')
    expect(reconciled).toBe(1)
    expect(recorded).toBe(0)
    expect(applyCalled).toBe(false)

    const invalid = await handleResendContactWebhook({
      rawBody: optedBackIn,
      svixId: 'msg_bad_false',
      svixTimestamp: String(now),
      svixSignature: 'v1,not-a-real-signature',
      secret: testSecret,
      nowSeconds: now,
      applyUnsubscribe: async () => {
        applyCalled = true
        return 'applied'
      },
      reconcileResubscribe: async () => {
        reconciled += 1
        return 'correction_queued'
      },
      recordDelivery: async () => {
        recorded += 1
        return 'new'
      },
    })
    expect(invalid.status).toBe(400)
    expect(reconciled).toBe(1)
    expect(recorded).toBe(0)
    expect(applyCalled).toBe(false)

    const created = '{"type":"contact.created","data":{"email":"a@example.com","unsubscribed":false}}'
    const createdSigned = sign(created, String(now), 'msg_created')
    let createdType = ''
    const createdCorrection = await handleResendContactWebhook({
      rawBody: created,
      svixId: createdSigned.id,
      svixTimestamp: createdSigned.timestamp,
      svixSignature: createdSigned.signature,
      secret: testSecret,
      nowSeconds: now,
      applyUnsubscribe: async () => {
        applyCalled = true
        return 'applied'
      },
      reconcileResubscribe: async (_email, _svixId, eventType) => {
        reconciled += 1
        createdType = eventType
        return 'correction_queued'
      },
      recordDelivery: async () => {
        recorded += 1
        return 'new'
      },
    })
    expect(createdCorrection.body.correction).toBe('correction_queued')
    expect(createdType).toBe('contact.created')
    expect(reconciled).toBe(2)
    expect(recorded).toBe(0)
    expect(applyCalled).toBe(false)

    const createdUnsubscribed =
      '{"type":"contact.created","data":{"email":"a@example.com","unsubscribed":true}}'
    expect(resendContactResubscribeEmail(JSON.parse(createdUnsubscribed))).toBeNull()
    const createdTrue = sign(createdUnsubscribed, String(now), 'msg_created_true')
    const ignoredCreate = await handleResendContactWebhook({
      rawBody: createdUnsubscribed,
      svixId: createdTrue.id,
      svixTimestamp: createdTrue.timestamp,
      svixSignature: createdTrue.signature,
      secret: testSecret,
      nowSeconds: now,
      applyUnsubscribe: async () => {
        applyCalled = true
        return 'applied'
      },
      reconcileResubscribe: async () => {
        reconciled += 1
        return 'correction_queued'
      },
      recordDelivery: async () => {
        recorded += 1
        return 'new'
      },
    })
    expect(ignoredCreate.body.ignored).toBe(true)
    expect(reconciled).toBe(2)
    expect(applyCalled).toBe(false)

    for (const payload of [
      '{"type":"contact.created","data":{"email":"a@example.com"}}',
      '{"type":"contact.created","data":{"email":"a@example.com","unsubscribed":"false"}}',
      '{"type":"contact.created","data":{"email":"a@example.com","unsubscribed":null}}',
      '{"type":"contact.updated","data":{"email":"a@example.com","unsubscribed":"false"}}',
    ]) {
      expect(resendContactResubscribeEmail(JSON.parse(payload))).toBeNull()
      const malformed = sign(payload, String(now), `msg_malformed_${recorded}`)
      const ignored = await handleResendContactWebhook({
        rawBody: payload,
        svixId: malformed.id,
        svixTimestamp: malformed.timestamp,
        svixSignature: malformed.signature,
        secret: testSecret,
        nowSeconds: now,
        applyUnsubscribe: async () => {
          applyCalled = true
          return 'applied'
        },
        reconcileResubscribe: async () => {
          reconciled += 1
          return 'correction_queued'
        },
        recordDelivery: async () => {
          recorded += 1
          return 'new'
        },
      })
      expect(ignored.body.ignored).toBe(true)
    }
    expect(reconciled).toBe(2)
    expect(applyCalled).toBe(false)

    const badCreated = await handleResendContactWebhook({
      rawBody: created,
      svixId: 'msg_bad_created',
      svixTimestamp: String(now),
      svixSignature: 'v1,not-a-real-signature',
      secret: testSecret,
      nowSeconds: now,
      applyUnsubscribe: async () => {
        applyCalled = true
        return 'applied'
      },
      reconcileResubscribe: async () => {
        reconciled += 1
        return 'correction_queued'
      },
      recordDelivery: async () => {
        recorded += 1
        return 'new'
      },
    })
    expect(badCreated.status).toBe(400)
    expect(reconciled).toBe(2)
    expect(applyCalled).toBe(false)
  })
})

describe('marketing sync decisions', () => {
  const confirmedOptIn = {
    email: 'person@example.com',
    emailConfirmed: true,
    optIn: true,
    optedOutAt: null,
  }

  it('rechecks confirmation, local consent, and provider unsubscribe before sending false', () => {
    expect(
      decideEmailMarketingSync({
        action: 'enroll',
        local: { ...confirmedOptIn, emailConfirmed: false },
      })
    ).toBe('defer_unconfirmed')
    expect(
      decideEmailMarketingSync({
        action: 'enroll',
        local: { ...confirmedOptIn, optIn: false },
      })
    ).toBe('skip_not_opted_in')
    expect(
      decideEmailMarketingSync({
        action: 'enroll',
        local: confirmedOptIn,
        providerUnsubscribed: true,
      })
    ).toBe('record_provider_unsubscribe')
    expect(Object.keys(marketingSubscriptionBody(false))).toEqual(['unsubscribed'])
  })

  it('lets a local withdrawal beat a queued enrollment', async () => {
    let reads = 0
    const sends: unknown[] = []
    const decision = await runEmailMarketingSyncAttempt({
      action: 'enroll',
      readLocal: async () => {
        reads += 1
        if (reads === 1) return confirmedOptIn
        return {
          ...confirmedOptIn,
          optIn: false,
          optedOutAt: '2026-10-07T00:00:00.000Z',
        }
      },
      lookupProvider: async () => 'subscribed',
      send: async (input) => {
        sends.push(input.body)
      },
      recordProviderUnsubscribe: async () => {
        throw new Error('should not record provider unsubscribe')
      },
    })
    expect(decision).toBe('skip_withdrawn')
    expect(sends).toEqual([])
  })

  it('schedules 60, 300, 900, and 3600 seconds, then stops at attempt 5', () => {
    expect(nextMarketingSyncDelaySeconds(1)).toBe(60)
    expect(nextMarketingSyncDelaySeconds(2)).toBe(300)
    expect(nextMarketingSyncDelaySeconds(3)).toBe(900)
    expect(nextMarketingSyncDelaySeconds(4)).toBe(3600)
    expect(nextMarketingSyncDelaySeconds(5)).toBeNull()
  })

  it('completes a missing-contact withdrawal without creating or patching a contact', async () => {
    const calls: string[] = []
    const decision = await runEmailMarketingSyncAttempt({
      action: 'withdraw',
      readLocal: async () => ({
        ...confirmedOptIn,
        optIn: false,
        optedOutAt: '2026-10-07T00:00:00.000Z',
      }),
      lookupProvider: async () => {
        calls.push('GET')
        return 'missing'
      },
      send: async (input) => {
        calls.push(input.method)
      },
      recordProviderUnsubscribe: async () => {
        throw new Error('should not record provider unsubscribe')
      },
    })
    expect(decision).toBe('withdraw_contact_absent')
    expect(calls).toEqual(['GET'])
  })

  it('treats a failed contact lookup as retryable and does not write', async () => {
    const calls: string[] = []
    await expect(
      runEmailMarketingSyncAttempt({
        action: 'withdraw',
        readLocal: async () => ({
          ...confirmedOptIn,
          optIn: false,
          optedOutAt: '2026-10-07T00:00:00.000Z',
        }),
        lookupProvider: async () => {
          throw new Error('provider_lookup_failed')
        },
        send: async (input) => {
          calls.push(input.method)
        },
        recordProviderUnsubscribe: async () => undefined,
      })
    ).rejects.toThrow('provider_lookup_failed')
    expect(calls).toEqual([])
  })

  it('patches only unsubscribed true when the contact exists', async () => {
    const sends: Array<{ method: string; body: { unsubscribed: boolean } }> = []
    const decision = await runEmailMarketingSyncAttempt({
      action: 'withdraw',
      readLocal: async () => ({
        ...confirmedOptIn,
        optIn: false,
        optedOutAt: '2026-10-07T00:00:00.000Z',
      }),
      lookupProvider: async () => 'subscribed',
      send: async (input) => {
        sends.push({ method: input.method, body: input.body })
      },
      recordProviderUnsubscribe: async () => {
        throw new Error('should not record provider unsubscribe')
      },
    })
    expect(decision).toBe('send_unsubscribed_true')
    expect(sends).toEqual([{ method: 'PATCH', body: { unsubscribed: true } }])
  })
})

describe('signup and phone UI', () => {
  const signup = readFileSync(resolve(repoRoot, 'app/signup/page.tsx'), 'utf8')
  const phone = readFileSync(
    resolve(repoRoot, 'components/profile/profile-phone-verification-card.tsx'),
    'utf8'
  )
  const progress = readFileSync(
    resolve(repoRoot, 'components/application/applicant-verification-progress.tsx'),
    'utf8'
  )
  const withdrawal = readFileSync(
    resolve(repoRoot, 'components/profile/email-marketing-preference-card.tsx'),
    'utf8'
  )
  const vercel = readFileSync(resolve(repoRoot, 'vercel.json'), 'utf8')

  it('blocks submit until the essential acknowledgement is checked', () => {
    expect(signup).toContain('useState(false)')
    expect(signup).toContain('if (!essentialAcknowledged)')
    expect(signup).toContain('disabled={isPending || !essentialAcknowledged}')
    const essential = signup.slice(
      signup.indexOf('id="essential-email-acknowledgement"'),
      signup.indexOf('id="email-marketing-opt-in"')
    )
    expect(essential).toContain('required')
    expect(essential).toContain('checked={essentialAcknowledged}')
  })

  it('keeps marketing optional and initially unchecked', () => {
    expect(signup).toContain('const [marketingOptIn, setMarketingOptIn] = useState(false)')
    const marketing = signup.slice(signup.indexOf('id="email-marketing-opt-in"'))
    expect(marketing).toContain('checked={marketingOptIn}')
    expect(marketing.slice(0, marketing.indexOf('</label>'))).not.toContain('required')
  })

  it('lets phone verification be skipped and does not show SMS consent', () => {
    expect(phone).toContain('PHONE_VERIFICATION_OPTIONAL_COPY')
    expect(phone).toContain('requestPhoneChangeOtp')
    expect(phone).not.toContain('SMS_ACCOUNT_NOTIFICATIONS_CONSENT_LABEL')
    expect(phone).not.toContain('recordSmsAccountNotificationsConsent')
    expect(progress).toContain('Skip for now')
    expect(progress).toContain('Not required for membership approval.')
  })

  it('shows withdrawal only while marketing is on', () => {
    expect(withdrawal).toContain('Unsubscribe from news and offers')
    expect(withdrawal).toContain('const subscribed = optedIn && !done')
    expect(withdrawal).toContain('withdrawEmailMarketing')
    expect(withdrawal).toContain(
      'You are not opted in to Huntsville Social Club news, event announcements, and offers.'
    )
  })

  it('does not schedule marketing sync or register it as a cron', () => {
    expect(vercel).not.toContain('email-marketing-sync')
    expect(vercel).not.toContain('resend/webhook')
  })
})

describe('marketing sync authentication', () => {
  it('returns 401 when the cron secret is missing or wrong', async () => {
    const previous = process.env.CRON_SECRET
    delete process.env.CRON_SECRET
    const { GET } = await import('@/app/api/cron/email-marketing-sync/route')
    const missing = await GET(new Request('http://127.0.0.1/api/cron/email-marketing-sync'))
    expect(missing.status).toBe(401)
    process.env.CRON_SECRET = 'signup-consent-test-cron'
    const wrong = await GET(
      new Request('http://127.0.0.1/api/cron/email-marketing-sync', {
        headers: { authorization: 'Bearer something-else' },
      })
    )
    expect(wrong.status).toBe(401)
    if (previous === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = previous
  })
})

describe('public verified badge', () => {
  it('still requires a verified phone', () => {
    expect(
      isMemberPubliclyVerified({
        email: 'approved',
        phone: 'incomplete',
        profile_reviewed: 'approved',
        photo_reviewed: 'approved',
        locality: 'approved',
      })
    ).toBe(false)
  })
})
