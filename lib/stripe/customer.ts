import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'
import { getStripe } from '@/lib/stripe/config'
import { parseMembershipBilling } from '@/lib/membership-systems'

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
  if (billing.stripe_customer_id) {
    return billing.stripe_customer_id
  }

  const customer = await stripe.customers.create({
    email: input.email ?? undefined,
    name: profile?.full_name ?? undefined,
    metadata: {
      user_id: input.userId,
    },
  })

  const nextBilling = {
    ...billing,
    stripe_customer_id: customer.id,
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      membership_billing: nextBilling,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.userId)

  if (error) {
    throw new Error(error.message)
  }

  return customer.id
}
