import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { authPhoneConfirmedForSubmittedE164 } from '@/lib/member-phone-auth'
import { phonesMatchE164 } from '@/lib/member-phone'
import {
  parseApprovalGates,
  parseVerificationState,
  verificationStateFromGates,
} from '@/lib/membership-systems'

type Supabase = SupabaseClient<Database>

async function updateGatesAndVerification(
  supabase: Supabase,
  userId: string,
  gates: ReturnType<typeof parseApprovalGates>,
  extra?: {
    verified_phone_e164?: string | null
    phone_verified_at?: string | null
  }
) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('verification_state')
    .eq('id', userId)
    .maybeSingle()

  const verification_state = verificationStateFromGates(
    gates,
    parseVerificationState(profile?.verification_state)
  )

  await supabase
    .from('profiles')
    .update({
      approval_gates: gates,
      verification_state,
      ...extra,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
}

/** Sync email_verified gate when Supabase Auth confirms the account email. */
export async function syncEmailApprovalGateForUser(
  supabase: Supabase,
  userId: string,
  emailConfirmed: boolean
): Promise<void> {
  if (!emailConfirmed) return

  const { data: profile } = await supabase
    .from('profiles')
    .select('approval_gates, verification_state')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) return

  const gates = parseApprovalGates(profile.approval_gates)
  if (gates.email_verified === 'approved') return

  gates.email_verified = 'approved'
  await updateGatesAndVerification(supabase, userId, gates)
}

/** Sync phone_verified gate after Supabase Auth phone_change OTP succeeds. */
export async function syncPhoneApprovalGateForUser(
  supabase: Supabase,
  userId: string,
  phoneE164: string,
  authUser: { phone?: string | null }
): Promise<{ error?: string }> {
  if (!authPhoneConfirmedForSubmittedE164(authUser, phoneE164)) {
    return {
      error:
        'Phone number is not confirmed on your account yet. Verify the code sent to your phone.',
    }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('approval_gates, verification_state, verified_phone_e164')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) {
    return { error: 'Profile not found.' }
  }

  const gates = parseApprovalGates(profile.approval_gates)
  gates.phone_verified = 'approved'

  await updateGatesAndVerification(supabase, userId, gates, {
    verified_phone_e164: phoneE164,
    phone_verified_at: new Date().toISOString(),
  })

  return {}
}

/** Reset phone verification when the member changes their number. */
export async function resetPhoneApprovalGateForUser(
  supabase: Supabase,
  userId: string,
  pendingPhoneE164: string | null
): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('approval_gates, verification_state, verified_phone_e164')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) return

  if (
    pendingPhoneE164 &&
    phonesMatchE164(pendingPhoneE164, profile.verified_phone_e164)
  ) {
    return
  }

  const gates = parseApprovalGates(profile.approval_gates)
  if (gates.phone_verified === 'approved' && !pendingPhoneE164) {
    gates.phone_verified = 'incomplete'
  } else {
    gates.phone_verified = 'pending_review'
  }

  const verification = parseVerificationState(profile.verification_state)
  delete verification.phone

  await supabase
    .from('profiles')
    .update({
      approval_gates: gates,
      verification_state: verificationStateFromGates(gates, verification),
      verified_phone_e164: null,
      phone_verified_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
}
