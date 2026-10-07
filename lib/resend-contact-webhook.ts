import {
  decideEmailMarketingSync,
  marketingSubscriptionBody,
  type EmailMarketingSyncAction,
  type LocalMarketingConsent,
} from '@/lib/email-marketing-sync'
import { verifyResendWebhookSignature } from '@/lib/resend-webhook-signature'

export type ResendWebhookWrite = 'none'

export type ResendContactWebhookResult = {
  status: number
  body: Record<string, unknown>
}

const IGNORED_EVENT_TYPES = new Set([
  'contact.created',
  'contact.updated',
  'contact.deleted',
  'contact.topics.updated',
])

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function resendContactEventType(event: unknown): string | null {
  const record = asRecord(event)
  return typeof record?.type === 'string' ? record.type : null
}

/**
 * Provider withdrawal is contact.updated with JSON boolean true.
 * `unsubscribed: false` must not opt a profile back in.
 */
export function resendContactUnsubscribeEmail(event: unknown): string | null {
  const record = asRecord(event)
  if (record?.type !== 'contact.updated') return null
  const data = asRecord(record.data)
  if (!data || data.unsubscribed !== true) return null
  if (typeof data.email !== 'string') return null
  const email = data.email.trim()
  if (!email.includes('@')) return null
  return email
}

/**
 * A boolean false means the provider contact is subscribed. It is not consent
 * to opt back in. The database decides whether a locally withdrawn profile
 * needs another withdrawal.
 */
export function resendContactResubscribeEmail(event: unknown): string | null {
  const record = asRecord(event)
  if (record?.type !== 'contact.updated') return null
  const data = asRecord(record.data)
  if (!data || data.unsubscribed !== false) return null
  if (typeof data.email !== 'string') return null
  const email = data.email.trim()
  if (!email.includes('@')) return null
  return email
}

export type ResubscribeReconciliation =
  | 'correction_queued'
  | 'correction_pending'
  | 'duplicate'
  | 'ignored'

export async function handleResendContactWebhook(input: {
  rawBody: string
  svixId: string | null
  svixTimestamp: string | null
  svixSignature: string | null
  secret: string | undefined
  nowSeconds?: number
  applyUnsubscribe: (
    email: string,
    svixId: string
  ) => Promise<'applied' | 'duplicate'>
  reconcileResubscribe: (
    email: string,
    svixId: string
  ) => Promise<ResubscribeReconciliation>
  recordDelivery: (
    svixId: string,
    eventType: string
  ) => Promise<'new' | 'duplicate'>
}): Promise<ResendContactWebhookResult> {
  if (!input.secret) {
    return { status: 500, body: { error: 'Webhook secret is not configured.' } }
  }

  const verified = verifyResendWebhookSignature({
    payload: input.rawBody,
    svixId: input.svixId,
    svixTimestamp: input.svixTimestamp,
    svixSignature: input.svixSignature,
    secret: input.secret,
    nowSeconds: input.nowSeconds,
  })
  if (!verified) {
    return { status: 400, body: { error: 'Invalid webhook signature.' } }
  }

  let event: unknown
  try {
    event = JSON.parse(input.rawBody) as unknown
  } catch {
    return { status: 400, body: { error: 'Invalid webhook payload.' } }
  }

  const eventType = resendContactEventType(event)
  const svixId = input.svixId
  if (!svixId || !eventType || !IGNORED_EVENT_TYPES.has(eventType)) {
    return { status: 400, body: { error: 'Unsupported webhook event.' } }
  }

  const unsubscribeEmail = resendContactUnsubscribeEmail(event)
  if (unsubscribeEmail) {
    const result = await input.applyUnsubscribe(unsubscribeEmail, svixId)
    return {
      status: 200,
      body: { ok: true, duplicate: result === 'duplicate' },
    }
  }

  const resubscribeEmail = resendContactResubscribeEmail(event)
  if (resubscribeEmail) {
    const result = await input.reconcileResubscribe(resubscribeEmail, svixId)
    return {
      status: 200,
      body: {
        ok: true,
        correction: result,
        duplicate: result === 'duplicate',
      },
    }
  }

  const delivery = await input.recordDelivery(svixId, eventType)
  return {
    status: 200,
    body: {
      ok: true,
      ignored: true,
      duplicate: delivery === 'duplicate',
    },
  }
}

export function enrollmentWouldSendUnsubscribedFalse(input: {
  action: EmailMarketingSyncAction
  before: LocalMarketingConsent
  after: LocalMarketingConsent
  providerUnsubscribed: boolean
}): boolean {
  const first = decideEmailMarketingSync({
    action: input.action,
    local: input.before,
  })
  if (first !== 'send_unsubscribed_false') return false
  const second = decideEmailMarketingSync({
    action: 'enroll',
    local: input.after,
    providerUnsubscribed: input.providerUnsubscribed,
  })
  return second === 'send_unsubscribed_false'
}

export { marketingSubscriptionBody }
