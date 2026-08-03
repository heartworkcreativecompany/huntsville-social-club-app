import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import type { Database } from '@/lib/database.types'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'
import { getStripe } from '@/lib/stripe/config'
import {
  parseMembershipBilling,
  type MembershipBilling,
} from '@/lib/membership-systems'

function isUnusableStripeCustomerError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as {
    code?: string
    message?: string
    statusCode?: number
  }
  const message = (err.message ?? '').toLowerCase()
  return (
    err.code === 'resource_missing' ||
    message.includes('no such customer') ||
    message.includes('similar object exists in test mode') ||
    message.includes('similar object exists in live mode')
  )
}

async function persistBillingCustomer(
  supabase: SupabaseClient<Database>,
  userId: string,
  billing: MembershipBilling,
  customerId: string,
  options?: { clearTestSubscriptionRefs?: boolean }
): Promise<void> {
  const nextBilling: MembershipBilling = {
    ...billing,
    stripe_customer_id: customerId,
    ...(options?.clearTestSubscriptionRefs
      ? {
          // Test-mode subscription/price IDs are invalid under a live key.
          stripe_subscription_id: null,
          stripe_price_id: null,
        }
      : {}),
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      membership_billing: nextBilling,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (error) {
    throw new Error(error.message)
  }
}

async function createStripeCustomerForMember(
  stripe: Stripe,
  input: {
    userId: string
    email: string | null
    fullName: string | null | undefined
  }
): Promise<Stripe.Customer> {
  return stripe.customers.create({
    email: input.email ?? undefined,
    name: input.fullName ?? undefined,
    metadata: {
      user_id: input.userId,
    },
  })
}

/**
 * Returns a Stripe customer ID valid for the current API key mode (live/test).
 * If the profile still has a sandbox/test-era customer ID while using a live key,
 * creates a new live customer and persists it to profiles.membership_billing.stripe_customer_id.
 */
export async function getOrCreateStripeCustomer(
  supabase: SupabaseClient<Database>,
  input: { userId: string; email: string | null }
): Promise<string> {
  const stripe = getStripe()

  const { data: profile } = await supabase
    .from(MEMBER_PROFILES_VIEW)
    .select('membership_billing, full_name')
    .eq('id', input.userId)
    .single()

  const billing = parseMembershipBilling(profile?.membership_billing)
  const storedCustomerId = billing.stripe_customer_id

  if (storedCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(storedCustomerId)
      if (!existing.deleted) {
        return storedCustomerId
      }

      console.info('[stripe_customer] stored customer is deleted; creating replacement', {
        previousCustomerIdPrefix: `${storedCustomerId.slice(0, 8)}…`,
      })
    } catch (error) {
      if (!isUnusableStripeCustomerError(error)) {
        throw error
      }

      const message =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: string }).message)
          : 'resource_missing'

      console.info(
        '[stripe_customer] stored customer invalid for current Stripe mode; creating live customer',
        {
          previousCustomerIdPrefix: `${storedCustomerId.slice(0, 8)}…`,
          reason: message,
        }
      )
    }

    const replacement = await createStripeCustomerForMember(stripe, {
      userId: input.userId,
      email: input.email,
      fullName: profile?.full_name,
    })

    await persistBillingCustomer(
      supabase,
      input.userId,
      billing,
      replacement.id,
      { clearTestSubscriptionRefs: true }
    )

    console.info('[stripe_customer] replaced stale customer with live customer', {
      newCustomerIdPrefix: `${replacement.id.slice(0, 8)}…`,
    })

    return replacement.id
  }

  const customer = await createStripeCustomerForMember(stripe, {
    userId: input.userId,
    email: input.email,
    fullName: profile?.full_name,
  })

  await persistBillingCustomer(supabase, input.userId, billing, customer.id)

  return customer.id
}
