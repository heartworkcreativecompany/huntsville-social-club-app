import type Stripe from 'stripe'

/** Resolve subscription ID from a Stripe invoice across API shape variants. */
export function subscriptionIdFromInvoice(
  invoice: Stripe.Invoice
): string | null {
  const legacy = (
    invoice as Stripe.Invoice & {
      subscription?: string | Stripe.Subscription | null
    }
  ).subscription

  if (typeof legacy === 'string') return legacy
  if (legacy && typeof legacy === 'object' && 'id' in legacy) return legacy.id

  const parentSub = invoice.parent?.subscription_details?.subscription
  if (typeof parentSub === 'string') return parentSub

  const lineSub = invoice.lines?.data?.[0]?.subscription
  if (typeof lineSub === 'string') return lineSub
  if (lineSub && typeof lineSub === 'object' && 'id' in lineSub) return lineSub.id

  return null
}

/** Resolve billing period timestamps from a Stripe subscription. */
export function subscriptionPeriod(subscription: Stripe.Subscription): {
  periodStart: Date
  periodEnd: Date
} {
  const sub = subscription as Stripe.Subscription & {
    current_period_start?: number
    current_period_end?: number
  }

  const item = subscription.items?.data?.[0] as
    | (Stripe.SubscriptionItem & {
        current_period_start?: number
        current_period_end?: number
      })
    | undefined

  const periodStartSeconds =
    sub.current_period_start ?? item?.current_period_start
  const periodEndSeconds = sub.current_period_end ?? item?.current_period_end

  if (!periodStartSeconds || !periodEndSeconds) {
    throw new Error('Subscription billing period timestamps are missing.')
  }

  return {
    periodStart: new Date(periodStartSeconds * 1000),
    periodEnd: new Date(periodEndSeconds * 1000),
  }
}
