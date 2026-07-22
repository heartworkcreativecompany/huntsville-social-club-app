'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mergeProfileIntoDraft } from '@/lib/application-draft-sync'
import {
  type ApprovalGateKey,
  type LocalityConfirmation,
  type MembershipBilling,
  type PremiumVerification,
  type ReviewStatus,
  localityFromDraft,
  parseApprovalGates,
  parseLocalityConfirmation,
  parseMembershipBilling,
  parsePremiumVerification,
  parseVerificationState,
  verificationStateFromGates,
} from '@/lib/membership-systems'

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.', supabase: null, userId: null }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return { error: 'Administrator access required.', supabase: null, userId: null }
  }

  return { error: null, supabase, userId: user.id }
}

export async function updateApprovalGate(
  applicantId: string,
  gate: ApprovalGateKey,
  status: ReviewStatus
) {
  const auth = await requireAdmin()
  if (auth.error || !auth.supabase) {
    return { error: auth.error ?? 'Unauthorized' }
  }

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('approval_gates, verification_state')
    .eq('id', applicantId)
    .single()

  const gates = parseApprovalGates(profile?.approval_gates)
  gates[gate] = status

  const verification = verificationStateFromGates(
    gates,
    parseVerificationState(profile?.verification_state)
  )

  const { error } = await auth.supabase
    .from('profiles')
    .update({
      approval_gates: gates,
      verification_state: verification,
      updated_at: new Date().toISOString(),
    })
    .eq('id', applicantId)

  if (error) return { error: error.message }

  revalidatePath(`/admin/applications/${applicantId}`)
  return { success: true as const }
}

export async function syncEmailGateFromAuth(applicantId: string) {
  const auth = await requireAdmin()
  if (auth.error || !auth.supabase) {
    return { error: auth.error ?? 'Unauthorized' }
  }

  const adminClient = createAdminClient()
  if (!adminClient) {
    return {
      error:
        'Service role key not configured. Mark email verification manually or set SUPABASE_SERVICE_ROLE_KEY.',
    }
  }

  const { data: userData, error: userError } =
    await adminClient.auth.admin.getUserById(applicantId)

  if (userError || !userData.user) {
    return { error: 'Could not load auth user.' }
  }

  const confirmed = Boolean(userData.user.email_confirmed_at)
  return updateApprovalGate(
    applicantId,
    'email_verified',
    confirmed ? 'approved' : 'incomplete'
  )
}

export async function updateLocalityReview(
  applicantId: string,
  input: {
    reviewStatus: ReviewStatus
    adminNotes?: string
    locality?: Partial<LocalityConfirmation>
  }
) {
  const auth = await requireAdmin()
  if (auth.error || !auth.supabase) {
    return { error: auth.error ?? 'Unauthorized' }
  }

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('locality_confirmation, approval_gates, verification_state')
    .eq('id', applicantId)
    .single()

  const current = parseLocalityConfirmation(profile?.locality_confirmation)
  const locality: LocalityConfirmation = {
    ...current,
    ...input.locality,
    reviewStatus: input.reviewStatus,
    adminNotes: input.adminNotes?.trim() ?? current.adminNotes,
    reviewedAt:
      input.reviewStatus === 'approved'
        ? new Date().toISOString()
        : current.reviewedAt,
  }

  const gates = parseApprovalGates(profile?.approval_gates)
  if (input.reviewStatus === 'approved') {
    gates.locality_confirmed = 'approved'
  } else if (input.reviewStatus === 'pending_review') {
    gates.locality_confirmed = 'pending_review'
  } else if (input.reviewStatus === 'needs_followup') {
    gates.locality_confirmed = 'needs_followup'
  }

  const verification = verificationStateFromGates(
    gates,
    parseVerificationState(profile?.verification_state)
  )

  const { error } = await auth.supabase
    .from('profiles')
    .update({
      locality_confirmation: locality,
      approval_gates: gates,
      verification_state: verification,
      updated_at: new Date().toISOString(),
    })
    .eq('id', applicantId)

  if (error) return { error: error.message }

  revalidatePath(`/admin/applications/${applicantId}`)
  return { success: true as const }
}

export async function syncLocalityFromDraft(applicantId: string) {
  const auth = await requireAdmin()
  if (auth.error || !auth.supabase) {
    return { error: auth.error ?? 'Unauthorized' }
  }

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('application_draft, full_name, membership_intent, location_area, locality_confirmation')
    .eq('id', applicantId)
    .single()

  if (!profile) return { error: 'Profile not found.' }

  const draft = mergeProfileIntoDraft(profile)
  const fromDraft = localityFromDraft(draft)
  const current = parseLocalityConfirmation(profile.locality_confirmation)

  const locality: LocalityConfirmation = {
    ...current,
    city: fromDraft.city,
    zip: fromDraft.zip,
    neighborhood: fromDraft.neighborhood,
    workContext: fromDraft.workContext,
    schoolOrCommunityContext: fromDraft.schoolOrCommunityContext,
    reviewStatus:
      current.reviewStatus === 'approved' ? 'approved' : 'pending_review',
  }

  const { error } = await auth.supabase
    .from('profiles')
    .update({
      locality_confirmation: locality,
      updated_at: new Date().toISOString(),
    })
    .eq('id', applicantId)

  if (error) return { error: error.message }

  revalidatePath(`/admin/applications/${applicantId}`)
  return { success: true as const }
}

export async function updatePremiumVerification(
  applicantId: string,
  input: Partial<PremiumVerification>
) {
  const auth = await requireAdmin()
  if (auth.error || !auth.supabase) {
    return { error: auth.error ?? 'Unauthorized' }
  }

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('premium_verification, verification_state, membership_billing')
    .eq('id', applicantId)
    .single()

  const current = parsePremiumVerification(profile?.premium_verification)
  const next: PremiumVerification = {
    ...current,
    ...input,
    reviewed_at:
      input.id_verification === 'approved' ||
      input.liveness_match === 'approved' ||
      input.background_check === 'approved'
        ? new Date().toISOString()
        : current.reviewed_at,
  }

  const verification = parseVerificationState(profile?.verification_state)
  if (next.id_verification === 'approved') verification.id_verified = 'approved'
  if (next.liveness_match === 'approved') verification.liveness = 'approved'
  if (next.background_check === 'approved') {
    verification.background_check = 'approved'
  }

  const billing = parseMembershipBilling(profile?.membership_billing)
  if (next.public_badge === 'vendor_reviewed') {
    billing.tier = 'vendor_reviewed'
  }

  const { error } = await auth.supabase
    .from('profiles')
    .update({
      premium_verification: next,
      verification_state: verification,
      membership_billing: billing,
      updated_at: new Date().toISOString(),
    })
    .eq('id', applicantId)

  if (error) return { error: error.message }

  revalidatePath(`/admin/applications/${applicantId}`)
  revalidatePath('/members')
  return { success: true as const }
}

export async function updateMembershipBilling(
  applicantId: string,
  input: Partial<MembershipBilling>
) {
  const auth = await requireAdmin()
  if (auth.error || !auth.supabase) {
    return { error: auth.error ?? 'Unauthorized' }
  }

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('membership_billing')
    .eq('id', applicantId)
    .single()

  const current = parseMembershipBilling(profile?.membership_billing)
  const next: MembershipBilling = {
    ...current,
    ...input,
    application_fee: {
      ...current.application_fee,
      ...input.application_fee,
    },
    payment_failure: {
      ...current.payment_failure,
      ...input.payment_failure,
    },
  }

  const { error } = await auth.supabase
    .from('profiles')
    .update({
      membership_billing: next,
      updated_at: new Date().toISOString(),
    })
    .eq('id', applicantId)

  if (error) return { error: error.message }

  revalidatePath(`/admin/applications/${applicantId}`)
  revalidatePath('/members')
  return { success: true as const }
}

export async function markPhotosReviewed(applicantId: string) {
  return updateApprovalGate(applicantId, 'photos_reviewed', 'approved')
}

export async function markApplicationReviewed(applicantId: string) {
  return updateApprovalGate(applicantId, 'application_reviewed', 'approved')
}

/**
 * Admin-only: mark the Auth email as confirmed and approve email_verified gate.
 * Use when confirmation mail cannot be delivered and identity has been verified another way.
 */
export async function markEmailVerifiedForApplicant(applicantId: string) {
  const auth = await requireAdmin()
  if (auth.error || !auth.supabase) {
    return { error: auth.error ?? 'Unauthorized' }
  }

  const adminClient = createAdminClient()
  if (!adminClient) {
    return {
      error:
        'Service role key not configured. Set SUPABASE_SERVICE_ROLE_KEY to confirm email in Auth.',
    }
  }

  const { error: authError } = await adminClient.auth.admin.updateUserById(
    applicantId,
    { email_confirm: true }
  )

  if (authError) {
    return { error: authError.message }
  }

  const gateResult = await updateApprovalGate(
    applicantId,
    'email_verified',
    'approved'
  )

  if (gateResult.error) {
    return { error: gateResult.error }
  }

  revalidatePath(`/admin/applications/${applicantId}`)
  revalidatePath('/application/status')
  revalidatePath('/login')
  return { success: true as const }
}

/**
 * Admin-safe reset of Stripe Identity verification for retesting.
 * Clears session metadata and sets identity gates back to incomplete.
 * Does not change application_status or other approval gates.
 */
export async function resetIdentityVerification(applicantId: string) {
  const auth = await requireAdmin()
  if (auth.error || !auth.supabase) {
    return { error: auth.error ?? 'Unauthorized' }
  }

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('approval_gates, verification_state')
    .eq('id', applicantId)
    .single()

  if (!profile) {
    return { error: 'Applicant not found.' }
  }

  const gates = parseApprovalGates(profile.approval_gates)
  gates.identity_verified = 'incomplete'

  const verification = verificationStateFromGates(
    gates,
    parseVerificationState(profile.verification_state)
  )
  verification.id_verified = 'incomplete'

  const { error } = await auth.supabase
    .from('profiles')
    .update({
      identity_verification_status: 'not_started',
      identity_verification_session_id: null,
      identity_verified_at: null,
      identity_verification_last_error: null,
      approval_gates: gates,
      verification_state: verification,
      updated_at: new Date().toISOString(),
    })
    .eq('id', applicantId)

  if (error) return { error: error.message }

  revalidatePath(`/admin/applications/${applicantId}`)
  revalidatePath('/application/status')
  revalidatePath('/application')
  return { success: true as const }
}
