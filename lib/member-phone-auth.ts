/**
 * Phone verification for members uses Supabase Auth `phone_change` OTP.
 * SMS delivery depends on the SMS provider configured in the Supabase project
 * (Authentication → Phone). There is no separate Twilio SDK path in this app.
 *
 * Always pass strict US E.164 (`+1XXXXXXXXXX`) — never raw 10-digit national numbers.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isStrictUsPhoneE164,
  phonesMatchE164,
  requireUsPhoneE164,
} from '@/lib/member-phone'

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

type AuthClient = Pick<SupabaseClient, 'auth'>

function assertUsPhoneE164ForAuth(phoneE164: string): string {
  const result = requireUsPhoneE164(phoneE164)
  if (result.error || !result.e164 || !isStrictUsPhoneE164(result.e164)) {
    throw new Error(
      result.error ??
        'Phone must be US E.164 (+1XXXXXXXXXX) before calling Supabase Auth.'
    )
  }
  return result.e164
}

/**
 * Request OTP for an already signed-in user attaching or changing a phone number.
 * First send: updateUser. Resend to same pending number: resend phone_change.
 * `phoneE164` must already be strict US E.164 (re-validated here as a safety net).
 */
export async function requestPhoneChangeOtp(
  supabase: AuthClient,
  phoneE164: string,
  options: { resend: boolean }
) {
  const e164 = assertUsPhoneE164ForAuth(phoneE164)

  if (options.resend) {
    return supabase.auth.resend({
      type: 'phone_change',
      phone: e164,
    })
  }

  return supabase.auth.updateUser({
    phone: e164,
  })
}

export async function verifyPhoneChangeOtp(
  supabase: AuthClient,
  phoneE164: string,
  token: string
) {
  const e164 = assertUsPhoneE164ForAuth(phoneE164)

  const result = await supabase.auth.verifyOtp({
    phone: e164,
    token,
    type: 'phone_change',
  })

  if (!result.error) {
    await supabase.auth.refreshSession()
  }

  return result
}
