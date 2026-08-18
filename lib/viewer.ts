import { createClient } from '@/lib/supabase/server'
import { loadProfileForUser } from '@/lib/load-profile'
import {
  canAccessMemberFeatures,
  getApplicationStatus,
  resolveMembershipStatus,
  type ApplicationStatus,
  type MembershipStatus,
} from '@/lib/membership'

export type ViewerProfile = {
  id: string
  email: string | null
  full_name: string | null
  role: string | null
  created_at: string | null
  application_status: string | null
  membership_intent: string | null
  application_draft: import('@/lib/application').ApplicationDraft | null
  application_submitted_at: string | null
  application_reviewed_at: string | null
  verified_at: string | null
  admin_review_notes: string | null
  location_area: string | null
  referral_source: string | null
  contact_email: string | null
  show_contact_email: boolean | null
  verified_phone_e164: string | null
  phone_verified_at: string | null
  sms_marketing_opt_in: boolean | null
  sms_marketing_opt_in_at: string | null
  sms_marketing_consent_version: string | null
  sms_marketing_consent_source: string | null
  sms_marketing_consent_phone_e164: string | null
  sms_marketing_opted_out_at: string | null
  identity_verification_status: string | null
  identity_verification_session_id: string | null
  identity_verified_at: string | null
  identity_verification_last_error: string | null
  verification_state: unknown
  approval_gates: unknown
  locality_confirmation: unknown
  premium_verification: unknown
  membership_billing: unknown
  discovery_intent: string | null
  location_city: string | null
  location_zip: string | null
  birth_year: number | null
  discovery_interests: string[] | null
  discovery_industry: string | null
  connections_open_to: string[] | null
  connection_intents: string[] | null
  profile_pending_revision: unknown
  profile_revision_status: string | null
  profile_revision_submitted_at: string | null
  profile_revision_reviewed_at: string | null
  profile_revision_admin_notes: string | null
  profile_revision_history: unknown
  messaging_suspended_at: string | null
  messaging_suspension_reason: string | null
  messaging_suspended_by: string | null
  compatibility_questionnaire: unknown
  compatibility_completed_at: string | null
  compatibility_updated_at: string | null
  wants_curated_matches: boolean | null
  curated_matches_paused_at: string | null
  curated_matches_pause_reason: string | null
  last_match_generation_at: string | null
  last_match_review_at: string | null
}

export type Viewer = {
  userId: string
  email: string
  authPhone: string | null
  profile: ViewerProfile | null
  role: string
  applicationStatus: ApplicationStatus
  membershipStatus: MembershipStatus
  canAccessApp: boolean
  applicationSchemaReady: boolean
}

export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { profile, schemaReady } = await loadProfileForUser(supabase, user.id)

  const role = profile?.role ?? 'member'
  const applicationStatus = getApplicationStatus(profile)
  const membershipStatus = resolveMembershipStatus(profile)
  const canAccessApp = canAccessMemberFeatures(profile, role)

  return {
    userId: user.id,
    email: user.email ?? profile?.email ?? '',
    authPhone: user.phone ?? null,
    profile,
    role,
    applicationStatus,
    membershipStatus,
    canAccessApp,
    applicationSchemaReady: schemaReady,
  }
}
