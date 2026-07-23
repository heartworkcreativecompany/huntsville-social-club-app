'use server'

import { revalidatePath } from 'next/cache'
import {
  resetPhoneApprovalGateForUser,
  syncPhoneApprovalGateForUser,
} from '@/lib/approval-gate-sync'
import { requireUsPhoneE164 } from '@/lib/member-phone'
import { createClient } from '@/lib/supabase/server'

/**
 * Phone verification actions for the member-facing "Phone verification" step.
 * Implementation uses Supabase Auth phone_change OTP; SMS delivery depends on
 * the SMS provider configured in the Supabase project (commonly Twilio).
 * All numbers are normalized to US E.164 before any Auth/gate updates.
 */

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

  revalidatePath('/profile')
  revalidatePath('/application/status')
  revalidatePath('/application')
  revalidatePath('/members')
  revalidatePath(`/members/${user.id}`)
  revalidatePath('/home')

  return { success: true as const, phoneE164: parsed.e164 }
}
