/** Checkout completion may open a cycle only after Stripe reports the payment settled. */
export function checkoutPaymentSettlesMembership(
  paymentStatus: string | null | undefined
): boolean {
  return paymentStatus === 'paid' || paymentStatus === 'no_payment_required'
}

/**
 * invoice.paid opens a cycle for the first paid invoice and for renewals.
 * Other billing reasons do not.
 */
export function entitlementOpenForInvoiceBillingReason(
  billingReason: string | null | undefined
): 'initial' | 'renewal' | null {
  if (billingReason === 'subscription_create') return 'initial'
  if (billingReason === 'subscription_cycle') return 'renewal'
  return null
}
