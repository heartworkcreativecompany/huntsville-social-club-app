/**
 * Phone verification for members uses Supabase Auth `phone_change` OTP.
 * SMS delivery depends on the SMS provider configured in the Supabase project
 * (Authentication → Phone). There is no separate Twilio SDK path in this app.
 *
 * Always pass strict US E.164 (`+1XXXXXXXXXX`) — never raw 10-digit national numbers.
 * Provider calls assert E.164 immediately before each auth method (no upstream-only trust).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertStrictUsE164ForProvider,
  logPhoneOtpDebug,
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

/**
 * Request OTP for an already signed-in user attaching or changing a phone number.
 * First send: updateUser({ phone }). Resend: resend({ type: 'phone_change', phone }).
 * The value passed to Supabase is asserted strict US E.164 at the call site.
 */
export async function requestPhoneChangeOtp(
  supabase: AuthClient,
  phoneE164: string,
  options: { resend: boolean }
) {
  // Upstream should already normalize; re-validate then hard-assert for the provider.
  const parsed = requireUsPhoneE164(phoneE164)
  if (parsed.error || !parsed.e164) {
    logPhoneOtpDebug('assert_e164', {
      exactPhone: phoneE164,
      rawInput: phoneE164,
      boundary: options.resend ? 'auth.resend' : 'auth.updateUser',
      errorMessage: parsed.error,
      note: 'requestPhoneChangeOtp rejected input before provider assert',
    })
    throw new Error(
      parsed.error ??
        'Phone must be US E.164 (+1XXXXXXXXXX) before calling Supabase Auth.'
    )
  }

  if (options.resend) {
    const phoneForProvider = assertStrictUsE164ForProvider(
      parsed.e164,
      'auth.resend(phone_change)'
    )
    logPhoneOtpDebug('provider_send', {
      exactPhone: phoneForProvider,
      normalized: parsed.e164,
      resend: true,
      boundary: 'auth.resend',
      note: `FINAL provider phone for resend: ${phoneForProvider}`,
    })
    const result = await supabase.auth.resend({
      type: 'phone_change',
      phone: phoneForProvider,
    })
    if (result.error) {
      logPhoneOtpDebug('provider_send', {
        exactPhone: phoneForProvider,
        resend: true,
        boundary: 'auth.resend',
        errorMessage: result.error.message,
        errorCode: result.error.code ?? result.error.status ?? null,
        note: 'Supabase/Twilio rejected auth.resend phone_change',
      })
    }
    return result
  }

  const phoneForProvider = assertStrictUsE164ForProvider(
    parsed.e164,
    'auth.updateUser(phone)'
  )
  logPhoneOtpDebug('provider_send', {
    exactPhone: phoneForProvider,
    normalized: parsed.e164,
    resend: false,
    boundary: 'auth.updateUser',
    note: `FINAL provider phone for updateUser: ${phoneForProvider}`,
  })
  const result = await supabase.auth.updateUser({
    phone: phoneForProvider,
  })
  if (result.error) {
    logPhoneOtpDebug('provider_send', {
      exactPhone: phoneForProvider,
      resend: false,
      boundary: 'auth.updateUser',
      errorMessage: result.error.message,
      errorCode: result.error.code ?? result.error.status ?? null,
      note: 'Supabase/Twilio rejected auth.updateUser phone',
    })
  }
  return result
}

export async function verifyPhoneChangeOtp(
  supabase: AuthClient,
  phoneE164: string,
  token: string
) {
  const parsed = requireUsPhoneE164(phoneE164)
  if (parsed.error || !parsed.e164) {
    logPhoneOtpDebug('assert_e164', {
      exactPhone: phoneE164,
      boundary: 'auth.verifyOtp',
      errorMessage: parsed.error,
      note: 'verifyPhoneChangeOtp rejected input before provider assert',
    })
    throw new Error(
      parsed.error ??
        'Phone must be US E.164 (+1XXXXXXXXXX) before calling Supabase Auth.'
    )
  }

  const phoneForProvider = assertStrictUsE164ForProvider(
    parsed.e164,
    'auth.verifyOtp(phone_change)'
  )
  logPhoneOtpDebug('provider_verify', {
    exactPhone: phoneForProvider,
    boundary: 'auth.verifyOtp',
    note: `FINAL provider phone for verifyOtp: ${phoneForProvider}`,
  })

  const result = await supabase.auth.verifyOtp({
    phone: phoneForProvider,
    token,
    type: 'phone_change',
  })

  if (result.error) {
    logPhoneOtpDebug('provider_verify', {
      exactPhone: phoneForProvider,
      boundary: 'auth.verifyOtp',
      errorMessage: result.error.message,
      errorCode: result.error.code ?? result.error.status ?? null,
      note: 'Supabase Auth verifyOtp phone_change failed',
    })
  }

  if (!result.error) {
    await supabase.auth.refreshSession()
  }

  return result
}
