'use server'

import { revalidatePath } from 'next/cache'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'
import { createClient } from '@/lib/supabase/server'
import { requireAdminClient } from '@/lib/supabase/require-admin-client'
import type { ApplicationStatus } from '@/lib/application'
import {
  canApproveMember,
  parseApprovalGates,
  verificationStateFromGates,
  parseVerificationState,
  emptyMembershipBilling,
  parseMembershipBilling,
} from '@/lib/membership-systems'
import { trackServerEvent } from '@/lib/analytics'
import {
  sendApplicationApprovedEmail,
  sendApplicationNeedsInfoEmail,
  sendApplicationRejectedEmail,
} from '@/lib/transactional-email'
import { queueAutoGenerateCuratedMatches } from '@/lib/compatibility/auto-generate-matches'
import { revalidateCuratedMatchMemberRoutes } from '@/lib/compatibility/revalidate-curated-match-routes'

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.', supabase: null, userId: null }
  }

  const { data: profile } = await supabase
    .from(MEMBER_PROFILES_VIEW)
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return { error: 'Administrator access required.', supabase: null, userId: null }
  }

  return { error: null, supabase, userId: user.id }
}

export async function updateApplicationStatus(
  applicantId: string,
  status: ApplicationStatus,
  adminNotes?: string
) {
  const auth = await requireAdmin()
  if (auth.error || !auth.supabase) {
    return { error: auth.error ?? 'Unauthorized' }
  }

  const admin = requireAdminClient()
  const { data: applicant } = await admin
    .from('profiles')
    .select('email, approval_gates, verification_state, membership_billing')
    .eq('id', applicantId)
    .single()

  if (status === 'approved') {
    const gates = parseApprovalGates(applicant?.approval_gates)
    const check = canApproveMember(gates)
    if (!check.allowed) {
      return {
        error: `Cannot approve until all gates are complete: ${check.blockers.join('; ')}`,
      }
    }
  }

  const gates = parseApprovalGates(applicant?.approval_gates)
  const verification =
    status === 'approved'
      ? verificationStateFromGates(
          gates,
          parseVerificationState(applicant?.verification_state)
        )
      : parseVerificationState(applicant?.verification_state)

  const billing = parseMembershipBilling(applicant?.membership_billing)
  const billingUpdate =
    status === 'approved'
      ? {
          ...billing,
          tier: 'member' as const,
          subscription_status: 'none' as const,
        }
      : billing

  const { error } = await auth.supabase
    .from('profiles')
    .update({
      application_status: status,
      application_reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...(adminNotes !== undefined
        ? { admin_review_notes: adminNotes.trim() || null }
        : {}),
      ...(status === 'approved'
        ? {
            verified_at: new Date().toISOString(),
            verification_state: verification,
            membership_billing: billingUpdate,
          }
        : {}),
    })
    .eq('id', applicantId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/admin/applications')
  revalidatePath(`/admin/applications/${applicantId}`)
  revalidatePath('/application')
  revalidatePath('/application/status')
  revalidatePath('/members')
  revalidatePath('/home')

  if (status === 'approved') {
    trackServerEvent('application_approved')
    queueAutoGenerateCuratedMatches(applicantId, 'membership_approved')
    revalidateCuratedMatchMemberRoutes()
  }

  const email = applicant?.email
  if (email) {
    if (status === 'approved') {
      void sendApplicationApprovedEmail(email)
    } else if (status === 'rejected') {
      void sendApplicationRejectedEmail(email, adminNotes)
    } else if (status === 'needs_info') {
      void sendApplicationNeedsInfoEmail(email, adminNotes)
    }
  }

  return { success: true as const }
}

export async function approveApplication(applicantId: string) {
  return updateApplicationStatus(applicantId, 'approved', undefined)
}

export async function rejectApplication(applicantId: string, notes: string) {
  return updateApplicationStatus(applicantId, 'rejected', notes)
}

export async function requestMoreInfo(applicantId: string, notes: string) {
  if (!notes.trim()) {
    return { error: 'Please include guidance for the applicant.' }
  }
  return updateApplicationStatus(applicantId, 'needs_info', notes)
}

export async function markInReview(applicantId: string) {
  return updateApplicationStatus(applicantId, 'in_review', undefined)
}
