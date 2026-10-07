/**
 * Marketing enrollment synchronizes the Resend contact `unsubscribed` flag
 * with local consent. It is not membership in a newsletter segment or topic.
 * Do not add segments or topics here.
 */

export const EMAIL_MARKETING_SYNC_ATTEMPT_CAP = 5

/**
 * Matches claim_email_marketing_sync_jobs. The lease is a database claim,
 * not an atomic Resend write. An enrollment request that already passed its
 * last local recheck can still reach Resend after a withdrawal. The
 * withdrawal job stays pending until that job's own lookup or PATCH
 * reconciles the contact.
 */
export const EMAIL_MARKETING_SYNC_LEASE_MS = 20_000

export type EmailMarketingSyncAction = 'enroll' | 'withdraw'

export type EmailMarketingSyncDecision =
  | 'send_unsubscribed_false'
  | 'send_unsubscribed_true'
  | 'withdraw_contact_absent'
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
 * opt-in are rechecked before an enrollment provider write. Provider
 * unsubscribe blocks sending `unsubscribed: false`.
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

/**
 * `attemptCount` is the value stored at acquisition, already incremented.
 * Attempt 1 waits 60 seconds, then 300, 900, and 3600. Attempt 5 is terminal.
 */
export function nextMarketingSyncDelaySeconds(attemptCount: number): number | null {
  if (attemptCount >= EMAIL_MARKETING_SYNC_ATTEMPT_CAP) return null
  const steps = [60, 300, 900, 3600]
  return steps[attemptCount - 1] ?? null
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
 * after the first read and before the write cancels enrollment. The database
 * lease does not cancel an HTTP request that has already been sent.
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
    // A lookup error throws and is retryable. Only a definitive 404 is absence.
    const provider = await input.lookupProvider(again.email)
    const afterLookup = await input.readLocal()
    const stillWithdrawing = decideEmailMarketingSync({
      action: 'withdraw',
      local: afterLookup,
    })
    if (stillWithdrawing !== 'send_unsubscribed_true' || !afterLookup.email) {
      return stillWithdrawing
    }
    if (provider === 'missing') {
      return 'withdraw_contact_absent'
    }
    await input.send({
      email: afterLookup.email,
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
