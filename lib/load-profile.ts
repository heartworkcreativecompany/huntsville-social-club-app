import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import type { ViewerProfile } from '@/lib/viewer'
import { parseApplicationDraft } from '@/lib/application'

const PROFILE_FIELDS =
  'id, email, full_name, role, created_at, application_status, membership_intent, application_draft, application_submitted_at, application_reviewed_at, verified_at, admin_review_notes, location_area, referral_source'

const BASIC_FIELDS = 'id, email, full_name, role, created_at'

function isMissingApplicationColumnError(error: { message?: string } | null) {
  const msg = error?.message?.toLowerCase() ?? ''
  return (
    msg.includes('application_status') ||
    msg.includes('does not exist') ||
    msg.includes('column')
  )
}

export async function loadProfileForUser(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ profile: ViewerProfile | null; schemaReady: boolean }> {
  const extended = await supabase
    .from('profiles')
    .select(PROFILE_FIELDS)
    .eq('id', userId)
    .single()

  if (!extended.error && extended.data) {
    return {
      schemaReady: true,
      profile: {
        ...extended.data,
        application_draft: extended.data.application_draft
          ? parseApplicationDraft(extended.data.application_draft)
          : null,
      },
    }
  }

  if (!isMissingApplicationColumnError(extended.error)) {
    return { profile: null, schemaReady: true }
  }

  const basic = await supabase
    .from('profiles')
    .select(BASIC_FIELDS)
    .eq('id', userId)
    .single()

  if (!basic.data) {
    return { profile: null, schemaReady: false }
  }

  const legacyApproved =
    basic.data.role === 'admin' ||
    basic.data.role === 'host' ||
    Boolean(basic.data.full_name?.trim())

  return {
    schemaReady: false,
    profile: {
      ...basic.data,
      application_status: legacyApproved ? 'approved' : 'draft',
      membership_intent: null,
      application_draft: null,
      application_submitted_at: null,
      application_reviewed_at: null,
      verified_at: null,
      admin_review_notes: null,
      location_area: null,
      referral_source: null,
    },
  }
}
