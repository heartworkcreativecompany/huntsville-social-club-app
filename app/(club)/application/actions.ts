'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  mergeProfileIntoDraft,
  profileColumnsFromDraft,
} from '@/lib/application-draft-sync'
import {
  canSubmitApplication,
  emptyDraft,
  parseApplicationDraft,
  type ApplicationDraft,
} from '@/lib/application'
import { resolveApplicationStatus } from '@/lib/application'
import { validateApplicationForSubmit } from '@/lib/application-validation'
import { APPLICATION_TOTAL_STEPS } from '@/lib/application-form-content'
import { trackServerEvent } from '@/lib/analytics'
import { captureOperationalError } from '@/lib/capture-error'
import { sendApplicationSubmittedEmail } from '@/lib/transactional-email'
import {
  emptyApprovalGates,
  localityFromDraft,
} from '@/lib/membership-systems'
import { runCompatibilityConnectionsLifecycle } from '@/lib/compatibility/sync-server'

export async function saveApplicationDraft(draft: ApplicationDraft) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('application_status, connections_open_to')
    .eq('id', user.id)
    .single()

  const status = resolveApplicationStatus(profile)

  if (status !== 'draft' && status !== 'needs_info' && status !== 'rejected') {
    return { error: 'This application cannot be edited in its current status.' }
  }

  const previousConnections = profile?.connections_open_to ?? []
  const nextStatus = status === 'rejected' ? 'draft' : status
  const columns = profileColumnsFromDraft(draft)

  const { error } = await supabase
    .from('profiles')
    .update({
      application_status: nextStatus,
      ...columns,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) {
    return { error: error.message }
  }

  await runCompatibilityConnectionsLifecycle(
    user.id,
    previousConnections,
    columns.connections_open_to
  )

  revalidatePath('/application')
  revalidatePath('/application/status')
  revalidatePath('/home')
  revalidatePath('/members')

  trackServerEvent('application_draft_saved')

  return { success: true as const }
}

export async function submitApplication() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'application_status, full_name, membership_intent, location_area, application_draft, connections_open_to'
    )
    .eq('id', user.id)
    .single()

  if (!profile) {
    return { error: 'Profile not found.' }
  }

  const status = resolveApplicationStatus(profile)

  if (!canSubmitApplication(status)) {
    return { error: 'This application cannot be submitted right now.' }
  }

  const draft = mergeProfileIntoDraft(profile)
  const validationError = validateApplicationForSubmit(draft)

  if (validationError) {
    return { error: validationError }
  }

  const columns = profileColumnsFromDraft({
    ...draft,
    step: APPLICATION_TOTAL_STEPS,
  })

  const previousConnections = profile.connections_open_to ?? []

  const gates = emptyApprovalGates()
  gates.email_verified = 'pending_review'
  gates.phone_verified = 'incomplete'
  gates.photos_reviewed = 'pending_review'
  gates.application_reviewed = 'pending_review'
  gates.locality_confirmed = 'pending_review'

  const locality = localityFromDraft(draft)
  locality.reviewStatus = 'pending_review'

  const { error } = await supabase
    .from('profiles')
    .update({
      application_status: 'submitted',
      ...columns,
      approval_gates: gates,
      locality_confirmation: locality,
      application_submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) {
    captureOperationalError('application_submit', error)
    return { error: error.message }
  }

  await runCompatibilityConnectionsLifecycle(
    user.id,
    previousConnections,
    columns.connections_open_to
  )

  revalidatePath('/application')
  revalidatePath('/application/status')
  revalidatePath('/home')
  revalidatePath('/admin/applications')

  trackServerEvent('application_submitted')

  if (user.email) {
    void sendApplicationSubmittedEmail(user.email)
  }

  return { success: true as const }
}

export async function getApplicationDraftForUser(): Promise<ApplicationDraft> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return emptyDraft()

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'full_name, membership_intent, location_area, application_draft'
    )
    .eq('id', user.id)
    .single()

  if (!profile) return emptyDraft()

  return mergeProfileIntoDraft(profile)
}
