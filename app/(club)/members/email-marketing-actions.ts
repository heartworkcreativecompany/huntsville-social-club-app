'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { lookupMarketingProviderContact } from '@/lib/email-marketing-provider-lookup'
import {
  completeAccountMarketingPreference,
  EMAIL_MARKETING_PREFERENCE_SAVE_ERROR,
  type EmailMarketingPreferenceResult,
} from '@/lib/email-marketing-preference'

/**
 * Save the signed-in member's marketing preference.
 * Opt-out uses the authenticated withdrawal. Opt-in looks up the provider
 * before any database write, then asks the service-role commit function to
 * save that member only. The member function cannot complete an opt-in.
 */
export async function saveEmailMarketingPreference(
  optIn: boolean
): Promise<EmailMarketingPreferenceResult> {
  if (optIn !== true && optIn !== false) {
    return { error: EMAIL_MARKETING_PREFERENCE_SAVE_ERROR }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const result = await completeAccountMarketingPreference({
    signedIn: true,
    email: user.email ?? null,
    optIn,
    lookup: (email) =>
      lookupMarketingProviderContact({
        email,
        apiKey: process.env.RESEND_API_KEY,
      }),
    readLocallyOptedIn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('email_marketing_opt_in, email_marketing_opted_out_at')
        .eq('id', user.id)
        .maybeSingle()
      if (error || !data) return null
      return data.email_marketing_opt_in === true && data.email_marketing_opted_out_at == null
    },
    withdraw: async () => {
      const { data, error } = await supabase.rpc('set_own_email_marketing_preference', {
        opt_in: false,
      })
      if (error || data !== 'opted_out') {
        return { error: EMAIL_MARKETING_PREFERENCE_SAVE_ERROR }
      }
      return { status: 'opted_out' }
    },
    commit: async (checkedAt) => {
      const admin = createAdminClient()
      if (!admin) return { status: 'unavailable' }
      const { data, error } = await admin.rpc('commit_email_marketing_opt_in', {
        target_id: user.id,
        checked_at: checkedAt,
      })
      if (error) return { error: EMAIL_MARKETING_PREFERENCE_SAVE_ERROR }
      if (data === 'opted_in') return { status: 'opted_in' }
      if (data === 'blocked_resubscription') return { status: 'blocked_resubscription' }
      return { error: EMAIL_MARKETING_PREFERENCE_SAVE_ERROR }
    },
  })

  if ('success' in result && result.success) revalidatePath('/profile')
  if ('status' in result && result.status === 'blocked_resubscription') {
    revalidatePath('/profile')
  }
  return result
}

/** Withdraw marketing email only. This cannot opt a member in. */
export async function withdrawEmailMarketing() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const { error } = await supabase.rpc('withdraw_email_marketing')
  if (error) {
    return { error: 'Could not save your email preference.' }
  }

  revalidatePath('/profile')
  return { success: true as const }
}
