/**
 * Phone verification for members uses Supabase Auth `phone_change` OTP.
 * SMS delivery depends on the SMS provider configured in the Supabase project
 * (Authentication → Phone). There is no separate Twilio SDK path in this app.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { phonesMatchE164 } from '@/lib/member-phone'

/** Confirmed phone on the auth user after a successful phone_change verify. */
export function confirmedAuthPhoneE164(user: {
  phone?: string | null
}): string | null {
  const phone = user.phone?.trim()
  return phone || null
}

/** Pending phone change OTP target before verify completes. */
export function pendingAuthPhoneChangeE164(user: {
  new_phone?: string | null
}): string | null {
  const phone = user.new_phone?.trim()
  return phone || null
}

export function authPhoneMatchesSubmittedE164(
  user: {
    phone?: string | null
    new_phone?: string | null
  },
  submittedE164: string
): boolean {
  return (
    phonesMatchE164(submittedE164, confirmedAuthPhoneE164(user)) ||
    phonesMatchE164(submittedE164, pendingAuthPhoneChangeE164(user))
  )
}

/** After phone_change OTP, only the confirmed auth phone should unlock gates. */
export function authPhoneConfirmedForSubmittedE164(
  user: { phone?: string | null },
  submittedE164: string
): boolean {
  return phonesMatchE164(submittedE164, confirmedAuthPhoneE164(user))
}

type AuthClient = Pick<
  SupabaseClient,
  'auth'
>

/**
 * Request OTP for an already signed-in user attaching or changing a phone number.
 * First send: updateUser. Resend to same pending number: resend phone_change.
 */
export async function requestPhoneChangeOtp(
  supabase: AuthClient,
  phoneE164: string,
  options: { resend: boolean }
) {
  if (options.resend) {
    return supabase.auth.resend({
      type: 'phone_change',
      phone: phoneE164,
    })
  }

  return supabase.auth.updateUser({
    phone: phoneE164,
  })
}

export async function verifyPhoneChangeOtp(
  supabase: AuthClient,
  phoneE164: string,
  token: string
) {
  const result = await supabase.auth.verifyOtp({
    phone: phoneE164,
    token,
    type: 'phone_change',
  })

  if (!result.error) {
    await supabase.auth.refreshSession()
  }

  return result
}
