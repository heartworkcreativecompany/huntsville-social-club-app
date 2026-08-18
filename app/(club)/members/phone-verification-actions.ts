'use server'

import { revalidatePath } from 'next/cache'
import {
  resetPhoneApprovalGateForUser,
  syncPhoneApprovalGateForUser,
} from '@/lib/approval-gate-sync'
import { requireUsPhoneE164 } from '@/lib/member-phone'
import {
  applySmsMarketingStop,
  nextSmsMarketingConsentState,
  type SmsMarketingConsentRecord,
} from '@/lib/sms-marketing-consent'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Phone verification actions for the member-facing "Phone verification" step.
 * Implementation uses Supabase Auth phone_change OTP; SMS delivery depends on
 * the SMS provider configured in the Supabase project (commonly Twilio).
 * All numbers are normalized to US E.164 before any Auth/gate updates.
 *
 * Optional SMS marketing consent is recorded separately and is never required
 * to send a verification code.
 */

function revalidatePhonePaths(userId: string) {
  revalidatePath('/profile')
  revalidatePath('/application/status')
  revalidatePath('/application')
  revalidatePath('/members')
  revalidatePath(`/members/${userId}`)
  revalidatePath('/home')
}

export async function markPhonePendingReverification(phoneInput: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const parsed = requireUsPhoneE164(phoneInput)
  if (parsed.error || !parsed.e164) {
    return { error: parsed.error ?? 'Enter a valid phone number.' }
  }

  await resetPhoneApprovalGateForUser(supabase, user.id, parsed.e164)

  revalidatePath('/profile')
  revalidatePath('/application/status')
  return { success: true as const }
}

export async function syncPhoneVerificationAfterOtp(phoneInput: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const parsed = requireUsPhoneE164(phoneInput)
  if (parsed.error || !parsed.e164) {
    return { error: parsed.error ?? 'Enter a valid phone number.' }
  }

  const syncResult = await syncPhoneApprovalGateForUser(
    supabase,
    user.id,
    parsed.e164,
    user
  )

  if (syncResult.error) {
    return { error: syncResult.error }
  }

  revalidatePhonePaths(user.id)

  return { success: true as const, phoneE164: parsed.e164 }
}

/**
 * Persist optional recurring SMS marketing consent when the member checks the
 * marketing checkbox. Does nothing when optedIn is false (verification may
 * proceed without marketing consent; prior opt-in evidence is preserved).
 */
export async function recordSmsMarketingConsent(input: {
  phoneInput: string
  optedIn: boolean
}) {
  if (!input.optedIn) {
    return { success: true as const, updated: false }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const parsed = requireUsPhoneE164(input.phoneInput)
  if (parsed.error || !parsed.e164) {
    return { error: parsed.error ?? 'Enter a valid phone number.' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'sms_marketing_opt_in, sms_marketing_opt_in_at, sms_marketing_consent_version, sms_marketing_consent_source, sms_marketing_consent_phone_e164, sms_marketing_opted_out_at'
    )
    .eq('id', user.id)
    .maybeSingle()

  const patch = nextSmsMarketingConsentState(
    profile as SmsMarketingConsentRecord | null,
    { optedIn: true, phoneE164: parsed.e164 }
  )

  if (!patch) {
    return { success: true as const, updated: false, phoneE164: parsed.e164 }
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) {
    return { error: 'Could not save text-message preferences.' }
  }

  revalidatePhonePaths(user.id)
  return { success: true as const, updated: true, phoneE164: parsed.e164 }
}

/** Apply STOP / unsubscribe for recurring marketing texts by E.164 phone. */
export async function optOutSmsMarketingByPhone(phoneInput: string) {
  const parsed = requireUsPhoneE164(phoneInput)
  if (parsed.error || !parsed.e164) {
    return { error: parsed.error ?? 'Enter a valid phone number.' }
  }

  const admin = createAdminClient()
  if (!admin) {
    return { error: 'Server is not configured to process SMS opt-outs.' }
  }

  const { data: byVerified, error: verifiedError } = await admin
    .from('profiles')
    .select(
      'id, sms_marketing_opt_in, sms_marketing_opt_in_at, sms_marketing_consent_version, sms_marketing_consent_source, sms_marketing_consent_phone_e164, sms_marketing_opted_out_at'
    )
    .eq('verified_phone_e164', parsed.e164)
    .limit(10)

  const { data: byConsent, error: consentError } = await admin
    .from('profiles')
    .select(
      'id, sms_marketing_opt_in, sms_marketing_opt_in_at, sms_marketing_consent_version, sms_marketing_consent_source, sms_marketing_consent_phone_e164, sms_marketing_opted_out_at'
    )
    .eq('sms_marketing_consent_phone_e164', parsed.e164)
    .limit(10)

  if (verifiedError || consentError) {
    return { error: 'Could not look up marketing consent.' }
  }

  const profilesById = new Map<
    string,
    {
      id: string
      sms_marketing_opt_in: boolean
      sms_marketing_opt_in_at: string | null
      sms_marketing_consent_version: string | null
      sms_marketing_consent_source: string | null
      sms_marketing_consent_phone_e164: string | null
      sms_marketing_opted_out_at: string | null
    }
  >()
  for (const profile of [...(byVerified ?? []), ...(byConsent ?? [])]) {
    profilesById.set(profile.id, profile)
  }
  const profiles = [...profilesById.values()]

  if (!profiles.length) {
    return { success: true as const, updated: 0 }
  }

  let updated = 0
  for (const profile of profiles) {
    const patch = applySmsMarketingStop(profile as SmsMarketingConsentRecord)
    if (!patch) {
      // Already opted out — idempotent no-op.
      continue
    }

    const { error } = await admin
      .from('profiles')
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profile.id)

    if (!error) {
      updated += 1
      revalidatePhonePaths(profile.id)
    }
  }

  return { success: true as const, updated }
}
