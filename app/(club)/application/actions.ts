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
    .select('application_status')
    .eq('id', user.id)
    .single()

  const status = resolveApplicationStatus(profile)

  if (status !== 'draft' && status !== 'needs_info' && status !== 'rejected') {
    return { error: 'This application cannot be edited in its current status.' }
  }

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

  revalidatePath('/application')
  revalidatePath('/home')
  revalidatePath('/members')

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
      'application_status, full_name, membership_intent, location_area, application_draft'
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

  const { error } = await supabase
    .from('profiles')
    .update({
      application_status: 'submitted',
      ...columns,
      application_submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/application')
  revalidatePath('/home')

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
