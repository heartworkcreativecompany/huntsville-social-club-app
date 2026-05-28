'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  canSubmitApplication,
  emptyDraft,
  parseApplicationDraft,
  type ApplicationDraft,
} from '@/lib/application'
import { resolveApplicationStatus } from '@/lib/application'

function draftFromProfile(profile: {
  full_name: string | null
  membership_intent: string | null
  location_area: string | null
  referral_source: string | null
  application_draft: unknown
}): ApplicationDraft {
  const parsed = parseApplicationDraft(profile.application_draft)
  return {
    ...parsed,
    fullName: parsed.fullName || profile.full_name || '',
    membershipIntent:
      parsed.membershipIntent || profile.membership_intent || '',
    locationArea: parsed.locationArea || profile.location_area || '',
    referralSource: parsed.referralSource || profile.referral_source || '',
  }
}

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

  const { error } = await supabase
    .from('profiles')
    .update({
      application_status: nextStatus,
      full_name: draft.fullName.trim() || null,
      membership_intent: draft.membershipIntent.trim() || null,
      location_area: draft.locationArea.trim() || null,
      referral_source: draft.referralSource.trim() || null,
      application_draft: draft,
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
      'application_status, full_name, membership_intent, location_area, referral_source, application_draft'
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

  const draft = draftFromProfile(profile)

  if (!draft.fullName.trim()) {
    return { error: 'Please provide your full name before submitting.' }
  }

  if (!draft.membershipIntent.trim()) {
    return { error: 'Please share your membership intent before submitting.' }
  }

  if (!draft.acknowledgements) {
    return {
      error: 'Please confirm the membership acknowledgements before submitting.',
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      application_status: 'submitted',
      full_name: draft.fullName.trim(),
      membership_intent: draft.membershipIntent.trim(),
      location_area: draft.locationArea.trim() || null,
      referral_source: draft.referralSource.trim() || null,
      application_draft: { ...draft, step: 3 },
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
      'full_name, membership_intent, location_area, referral_source, application_draft'
    )
    .eq('id', user.id)
    .single()

  if (!profile) return emptyDraft()

  return draftFromProfile(profile)
}
