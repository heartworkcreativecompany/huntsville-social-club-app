import { createHmac, timingSafeEqual } from 'node:crypto'

const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60

export type ResendWebhookSignatureInput = {
  /** Exact request body bytes decoded as UTF-8. Do not re-serialize JSON. */
  payload: string
  svixId: string | null
  svixTimestamp: string | null
  svixSignature: string | null
  secret: string
  nowSeconds?: number
}

/**
 * Svix signature used by Resend webhooks.
 * Signed content is `${svix-id}.${svix-timestamp}.${rawBody}`.
 */
export function verifyResendWebhookSignature(
  input: ResendWebhookSignatureInput
): boolean {
  if (!input.svixId || !input.svixTimestamp || !input.svixSignature || !input.secret) {
    return false
  }

  const timestamp = Number(input.svixTimestamp)
  if (!Number.isFinite(timestamp)) return false
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000)
  if (Math.abs(now - timestamp) > TIMESTAMP_TOLERANCE_SECONDS) return false

  const secretBody = input.secret.startsWith('whsec_')
    ? input.secret.slice('whsec_'.length)
    : input.secret
  const key = Buffer.from(secretBody, 'base64')
  if (key.length === 0) return false

  const signed = `${input.svixId}.${input.svixTimestamp}.${input.payload}`
  const expected = createHmac('sha256', key).update(signed).digest('base64')
  const expectedBuffer = Buffer.from(expected)

  for (const part of input.svixSignature.split(' ')) {
    const comma = part.indexOf(',')
    if (comma <= 0) continue
    const version = part.slice(0, comma)
    const value = part.slice(comma + 1)
    if (version !== 'v1' || !value) continue
    const actual = Buffer.from(value)
    if (actual.length !== expectedBuffer.length) continue
    if (timingSafeEqual(actual, expectedBuffer)) return true
  }

  return false
}
