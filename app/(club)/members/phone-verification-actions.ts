'use server'

import { revalidatePath } from 'next/cache'
import {
  resetPhoneApprovalGateForUser,
  syncPhoneApprovalGateForUser,
} from '@/lib/approval-gate-sync'
import { normalizePhoneToE164, validatePhoneInput } from '@/lib/member-phone'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'
import { createClient } from '@/lib/supabase/server'

export async function markPhonePendingReverification(phoneInput: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const validationError = validatePhoneInput(phoneInput)
  if (validationError) {
    return { error: validationError }
  }

  const phoneE164 = normalizePhoneToE164(phoneInput)
  if (!phoneE164) {
    return { error: 'Enter a valid phone number.' }
  }

  await resetPhoneApprovalGateForUser(supabase, user.id, phoneE164)

  revalidatePath('/profile')
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

  const validationError = validatePhoneInput(phoneInput)
  if (validationError) {
    return { error: validationError }
  }

  const phoneE164 = normalizePhoneToE164(phoneInput)
  if (!phoneE164) {
    return { error: 'Enter a valid phone number.' }
  }

  const { data: profile } = await supabase
    .from(MEMBER_PROFILES_VIEW)
    .select('application_status')
    .eq('id', user.id)
    .single()

  if (profile?.application_status !== 'approved') {
    return {
      error:
        'Phone verification is available after your membership application is approved.',
    }
  }

  const syncResult = await syncPhoneApprovalGateForUser(
    supabase,
    user.id,
    phoneE164,
    user
  )

  if (syncResult.error) {
    return { error: syncResult.error }
  }

  revalidatePath('/profile')
  revalidatePath('/members')
  revalidatePath(`/members/${user.id}`)
  revalidatePath('/home')

  return { success: true as const, phoneE164 }
}
