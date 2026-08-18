import type Stripe from 'stripe'

/**
 * Verifies a Stripe webhook using the raw body and signing secret.
 * Throws on invalid/missing signatures — callers must not process the event.
 */
export function constructVerifiedStripeEvent(input: {
  rawBody: string
  signatureHeader: string | null | undefined
  webhookSecret: string
  stripe: Pick<Stripe, 'webhooks'>
}): Stripe.Event {
  if (!input.signatureHeader) {
    throw new Error('Missing Stripe signature header.')
  }
  return input.stripe.webhooks.constructEvent(
    input.rawBody,
    input.signatureHeader,
    input.webhookSecret
  )
}
