import { NextResponse, type NextRequest } from 'next/server'
import { isSmsStopKeyword } from '@/lib/sms-marketing-consent'
import { optOutSmsMarketingByPhone } from '@/app/(club)/members/phone-verification-actions'
import {
  formDataToTwilioParams,
  isValidTwilioRequestSignature,
  resolveTwilioWebhookPublicUrl,
  TWILIO_SIGNATURE_HEADER,
  twilioWebhookSecurityLog,
} from '@/lib/twilio-webhook'

/**
 * Inbound SMS webhook (Twilio form-urlencoded body).
 * STOP/unsubscribe keywords clear account-notification SMS eligibility only.
 * Does not affect one-time verification OTP capability.
 *
 * Requires TWILIO_AUTH_TOKEN and a valid X-Twilio-Signature.
 * Configure the Messaging Service inbound URL to:
 *   https://members.huntsvillesocialclub.com/api/sms/inbound
 */
export async function POST(request: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const signature = request.headers.get(TWILIO_SIGNATURE_HEADER)
  const hasSignature = Boolean(signature?.trim())

  if (!authToken?.trim()) {
    console.error(
      twilioWebhookSecurityLog({
        accepted: false,
        reason: 'missing_auth_token',
        hasSignature,
      })
    )
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!signature?.trim()) {
    console.error(
      twilioWebhookSecurityLog({
        accepted: false,
        reason: 'missing_signature',
        hasSignature: false,
      })
    )
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('application/x-www-form-urlencoded')) {
    console.error(
      twilioWebhookSecurityLog({
        accepted: false,
        reason: 'invalid_content_type',
        hasSignature,
      })
    )
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const form = await request.formData()
  const params = formDataToTwilioParams(form)

  const url = resolveTwilioWebhookPublicUrl({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    forwardedProto: request.headers.get('x-forwarded-proto'),
    forwardedHost: request.headers.get('x-forwarded-host'),
    host: request.headers.get('host'),
  })

  const valid = isValidTwilioRequestSignature({
    authToken,
    signature,
    url,
    params,
  })

  if (!valid) {
    console.error(
      twilioWebhookSecurityLog({
        accepted: false,
        reason: 'invalid_signature',
        hasSignature: true,
      })
    )
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const from = params.From ?? params.from ?? ''
  const body = params.Body ?? params.body ?? ''

  if (!from) {
    console.error(
      twilioWebhookSecurityLog({
        accepted: false,
        reason: 'missing_from',
        hasSignature: true,
      })
    )
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 })
  }

  if (!isSmsStopKeyword(body)) {
    return NextResponse.json({ ok: true, action: 'ignored' })
  }

  const result = await optOutSmsMarketingByPhone(from)
  if (result.error) {
    return NextResponse.json({ error: 'Unable to process opt-out.' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    action: 'opted_out',
    updated: result.updated ?? 0,
  })
}
