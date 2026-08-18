import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { enrichProfileFromDraft } from '@/lib/enrich-profile-discovery'
import type { ViewerProfile } from '@/lib/viewer'
import { parseApplicationDraft } from '@/lib/application'
import {
  DIRECTORY_PROFILE_BASE_FIELDS,
  MEMBER_PROFILE_SELECT_TIERS,
  PROFILE_BASE_FIELDS,
  isMissingSchemaColumnError,
} from '@/lib/profile-query-fields'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'

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
    contact_email: null,
    show_contact_email: false,
    verified_phone_e164: null,
    phone_verified_at: null,
    sms_marketing_opt_in: false,
    sms_marketing_opt_in_at: null,
    sms_marketing_consent_version: null,
    sms_marketing_consent_source: null,
    sms_marketing_consent_phone_e164: null,
    sms_marketing_opted_out_at: null,
    identity_verification_status: null,
    identity_verification_session_id: null,
    identity_verified_at: null,
    identity_verification_last_error: null,
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
    connections_open_to: null,
    connection_intents: null,
    profile_pending_revision: null,
    profile_revision_status: null,
    profile_revision_submitted_at: null,
    profile_revision_reviewed_at: null,
    profile_revision_admin_notes: null,
    profile_revision_history: null,
    compatibility_questionnaire: null,
    compatibility_completed_at: null,
    compatibility_updated_at: null,
    wants_curated_matches: null,
    curated_matches_paused_at: null,
    curated_matches_pause_reason: null,
    last_match_generation_at: null,
    last_match_review_at: null,
    messaging_suspended_at: null,
    messaging_suspension_reason: null,
    messaging_suspended_by: null,
  }
}

export async function loadProfileForUser(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ profile: ViewerProfile | null; schemaReady: boolean }> {
  for (let tierIndex = 0; tierIndex < MEMBER_PROFILE_SELECT_TIERS.length; tierIndex++) {
    const fields = MEMBER_PROFILE_SELECT_TIERS[tierIndex]!
    const result = await supabase
      .from(MEMBER_PROFILES_VIEW)
      .select(fields)
      .eq('id', userId)
      .single()

    if (!result.error && result.data) {
      if (fields === DIRECTORY_PROFILE_BASE_FIELDS) {
        return {
          schemaReady: false,
          profile: legacyViewerFromBasic(
            result.data as unknown as {
              id: string
              email: string | null
              full_name: string | null
              role: string | null
              created_at: string | null
            }
          ),
        }
      }

      return {
        schemaReady: tierIndex === 0,
        profile: toViewerProfile(
          result.data as unknown as Record<string, unknown>
        ),
      }
    }

    if (result.error && !isMissingSchemaColumnError(result.error)) {
      return { profile: null, schemaReady: true }
    }
  }

  return { profile: null, schemaReady: false }
}
