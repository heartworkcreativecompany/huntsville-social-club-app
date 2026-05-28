'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ApplicationStatus } from '@/lib/application'

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

export async function updateApplicationStatus(
  applicantId: string,
  status: ApplicationStatus,
  adminNotes?: string
) {
  const auth = await requireAdmin()
  if (auth.error || !auth.supabase) {
    return { error: auth.error ?? 'Unauthorized' }
  }

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
        ? { verified_at: new Date().toISOString() }
        : {}),
    })
    .eq('id', applicantId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/admin/applications')
  revalidatePath(`/admin/applications/${applicantId}`)
  revalidatePath('/members')
  revalidatePath('/home')

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
