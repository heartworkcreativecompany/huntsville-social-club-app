import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { enrichProfileFromDraft } from '@/lib/enrich-profile-discovery'
import type { ViewerProfile } from '@/lib/viewer'
import { parseApplicationDraft } from '@/lib/application'
import {
  PROFILE_APPLICATION_FIELDS,
  PROFILE_BASE_FIELDS,
  PROFILE_FULL_FIELDS,
  isMissingSchemaColumnError,
} from '@/lib/profile-query-fields'

function toViewerProfile(
  data: Record<string, unknown>
): ViewerProfile {
  const enriched = enrichProfileFromDraft(data as ViewerProfile)
  return {
    ...enriched,
    application_draft: enriched.application_draft
      ? parseApplicationDraft(enriched.application_draft)
      : null,
  } as ViewerProfile
}

function legacyViewerFromBasic(
  data: {
    id: string
    email: string | null
    full_name: string | null
    role: string | null
    created_at: string | null
  }
): ViewerProfile {
  const legacyApproved =
    data.role === 'admin' ||
    data.role === 'host' ||
    Boolean(data.full_name?.trim())

  return {
    ...data,
    application_status: legacyApproved ? 'approved' : 'draft',
    membership_intent: null,
    application_draft: null,
    application_submitted_at: null,
    application_reviewed_at: null,
    verified_at: null,
    admin_review_notes: null,
    location_area: null,
    referral_source: null,
    verification_state: null,
    approval_gates: null,
    locality_confirmation: null,
    premium_verification: null,
    membership_billing: null,
    discovery_intent: null,
    location_city: null,
    location_zip: null,
    birth_year: null,
    discovery_interests: null,
    discovery_industry: null,
  }
}

export async function loadProfileForUser(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ profile: ViewerProfile | null; schemaReady: boolean }> {
  const full = await supabase
    .from('profiles')
    .select(PROFILE_FULL_FIELDS)
    .eq('id', userId)
    .single()

  if (!full.error && full.data) {
    return {
      schemaReady: true,
      profile: toViewerProfile(full.data as unknown as Record<string, unknown>),
    }
  }

  if (full.error && !isMissingSchemaColumnError(full.error)) {
    return { profile: null, schemaReady: true }
  }

  const application = await supabase
    .from('profiles')
    .select(PROFILE_APPLICATION_FIELDS)
    .eq('id', userId)
    .single()

  if (!application.error && application.data) {
    return {
      schemaReady: true,
      profile: toViewerProfile(
        application.data as unknown as Record<string, unknown>
      ),
    }
  }

  if (
    application.error &&
    !isMissingSchemaColumnError(application.error)
  ) {
    return { profile: null, schemaReady: true }
  }

  const basic = await supabase
    .from('profiles')
    .select(PROFILE_BASE_FIELDS)
    .eq('id', userId)
    .single()

  if (!basic.data) {
    return { profile: null, schemaReady: false }
  }

  return {
    schemaReady: false,
    profile: legacyViewerFromBasic(basic.data),
  }
}
