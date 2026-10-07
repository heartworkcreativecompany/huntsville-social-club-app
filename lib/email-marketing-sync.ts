/**
 * Marketing enrollment synchronizes the Resend contact `unsubscribed` flag
 * with local consent. It is not membership in a newsletter segment or topic.
 * Do not add segments or topics here.
 */

export const EMAIL_MARKETING_SYNC_ATTEMPT_CAP = 5

export type EmailMarketingSyncAction = 'enroll' | 'withdraw'

export type EmailMarketingSyncDecision =
  | 'send_unsubscribed_false'
  | 'send_unsubscribed_true'
  | 'skip_withdrawn'
  | 'skip_not_opted_in'
  | 'defer_unconfirmed'
  | 'skip_no_email'
  | 'record_provider_unsubscribe'
  | 'missing_job'

export type LocalMarketingConsent = {
  email: string | null
  emailConfirmed: boolean
  optIn: boolean
  optedOutAt: string | null
}

export function marketingSubscriptionBody(unsubscribed: boolean): {
  unsubscribed: boolean
} {
  return { unsubscribed }
}

/**
 * Local withdrawal wins over a queued enrollment. Confirmation and current
 * opt-in are rechecked on every attempt. Provider unsubscribe blocks sending
 * `unsubscribed: false`.
 */
export function decideEmailMarketingSync(input: {
  action: EmailMarketingSyncAction
  local: LocalMarketingConsent
  providerUnsubscribed?: boolean | null
}): EmailMarketingSyncDecision {
  if (!input.local.email) return 'skip_no_email'

  if (input.action === 'withdraw') {
    return 'send_unsubscribed_true'
  }

  if (input.local.optedOutAt) return 'skip_withdrawn'
  if (!input.local.optIn) return 'skip_not_opted_in'
  if (!input.local.emailConfirmed) return 'defer_unconfirmed'
  if (input.providerUnsubscribed === true) return 'record_provider_unsubscribe'
  return 'send_unsubscribed_false'
}

export function nextMarketingSyncDelaySeconds(attemptCount: number): number | null {
  if (attemptCount >= EMAIL_MARKETING_SYNC_ATTEMPT_CAP) return null
  const steps = [60, 300, 900, 3600]
  return steps[Math.min(attemptCount, steps.length - 1)] ?? 3600
}

export type MarketingSyncSender = (input: {
  email: string
  body: { unsubscribed: boolean }
  method: 'POST' | 'PATCH'
}) => Promise<void>

export type MarketingSyncProviderLookup = (
  email: string
) => Promise<'missing' | 'subscribed' | 'unsubscribed'>

/**
 * Recheck local consent before any provider write. A withdrawal that lands
 * after the first read and before the write cancels enrollment.
 */
export async function runEmailMarketingSyncAttempt(input: {
  action: EmailMarketingSyncAction
  readLocal: () => Promise<LocalMarketingConsent>
  lookupProvider: MarketingSyncProviderLookup
  send: MarketingSyncSender
  recordProviderUnsubscribe: (email: string) => Promise<void>
}): Promise<EmailMarketingSyncDecision> {
  const first = await input.readLocal()
  const initial = decideEmailMarketingSync({
    action: input.action,
    local: first,
  })
  if (initial !== 'send_unsubscribed_false' && initial !== 'send_unsubscribed_true') {
    return initial
  }
  if (!first.email) return 'skip_no_email'

  if (initial === 'send_unsubscribed_true') {
    const again = await input.readLocal()
    const confirmed = decideEmailMarketingSync({
      action: 'withdraw',
      local: again,
    })
    if (confirmed !== 'send_unsubscribed_true' || !again.email) {
      return confirmed
    }
    await input.send({
      email: again.email,
      body: marketingSubscriptionBody(true),
      method: 'PATCH',
    })
    return 'send_unsubscribed_true'
  }

  const provider = await input.lookupProvider(first.email)
  const afterProvider = await input.readLocal()
  const decision = decideEmailMarketingSync({
    action: 'enroll',
    local: afterProvider,
    providerUnsubscribed: provider === 'unsubscribed',
  })

  if (decision === 'record_provider_unsubscribe') {
    if (afterProvider.email) {
      await input.recordProviderUnsubscribe(afterProvider.email)
    }
    return decision
  }

  if (decision !== 'send_unsubscribed_false' || !afterProvider.email) {
    return decision
  }

  await input.send({
    email: afterProvider.email,
    body: marketingSubscriptionBody(false),
    method: provider === 'missing' ? 'POST' : 'PATCH',
  })
  return 'send_unsubscribed_false'
}
