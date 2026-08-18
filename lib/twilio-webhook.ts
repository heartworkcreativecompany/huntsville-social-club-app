/**
 * Twilio inbound webhook request validation helpers.
 * Uses the official twilio-node `validateRequest` implementation.
 *
 * Never log auth tokens, signatures, full phone numbers, or message bodies.
 */

import twilio from 'twilio'
import { membersOrigin } from '@/lib/hostnames'

export const TWILIO_SIGNATURE_HEADER = 'x-twilio-signature'

export type TwilioWebhookParams = Record<string, string>

/**
 * Public URL Twilio used when signing the request.
 * Prefer the configured members origin (production webhook host), then
 * reconstruct from trusted forwarded proto/host headers.
 */
export function resolveTwilioWebhookPublicUrl(input: {
  pathname: string
  search?: string
  forwardedProto?: string | null
  forwardedHost?: string | null
  host?: string | null
  /** Explicit override for tests / rare configs. */
  configuredOrigin?: string | null
}): string {
  const path = input.pathname.startsWith('/')
    ? input.pathname
    : `/${input.pathname}`
  const search = input.search ?? ''

  const configured =
    trimOrigin(input.configuredOrigin) ||
    trimOrigin(process.env.NEXT_PUBLIC_MEMBERS_URL) ||
    trimOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
    null

  if (configured && !isLocalhostOrigin(configured)) {
    return `${configured}${path}${search}`
  }

  // Local / unset: reconstruct from proxy headers (Vercel sets these).
  const proto = firstHeaderValue(input.forwardedProto) || 'https'
  const host =
    firstHeaderValue(input.forwardedHost) ||
    firstHeaderValue(input.host) ||
    ''

  if (!host) {
    // Last resort for production misconfig — still prefer members origin helper.
    try {
      return `${membersOrigin()}${path}${search}`
    } catch {
      return `https://members.huntsvillesocialclub.com${path}${search}`
    }
  }

  const scheme = proto === 'http' ? 'http' : 'https'
  return `${scheme}://${host}${path}${search}`
}

export function formDataToTwilioParams(
  form: FormData
): TwilioWebhookParams {
  const params: TwilioWebhookParams = {}
  form.forEach((value, key) => {
    if (typeof value === 'string') {
      params[key] = value
    }
  })
  return params
}

/**
 * Validate X-Twilio-Signature with the official Twilio helper.
 * Returns false for missing token, missing signature, or invalid signature.
 */
export function isValidTwilioRequestSignature(input: {
  authToken: string | null | undefined
  signature: string | null | undefined
  url: string
  params: TwilioWebhookParams
}): boolean {
  const authToken = input.authToken?.trim()
  const signature = input.signature?.trim()
  if (!authToken || !signature || !input.url) {
    return false
  }

  try {
    return twilio.validateRequest(
      authToken,
      signature,
      input.url,
      input.params
    )
  } catch {
    return false
  }
}

/** Safe log payload — never include secrets or message PII. */
export function twilioWebhookSecurityLog(details: {
  accepted: boolean
  reason?:
    | 'missing_auth_token'
    | 'missing_signature'
    | 'invalid_signature'
    | 'invalid_content_type'
    | 'missing_from'
  hasSignature: boolean
}): Record<string, unknown> {
  return {
    event: 'twilio_sms_inbound',
    accepted: details.accepted,
    reason: details.reason,
    hasSignature: details.hasSignature,
  }
}

function trimOrigin(value: string | null | undefined): string | null {
  const trimmed = value?.trim().replace(/\/$/, '')
  return trimmed || null
}

function isLocalhostOrigin(origin: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(origin)
}

function firstHeaderValue(value: string | null | undefined): string {
  return value?.split(',')[0]?.trim() ?? ''
}
