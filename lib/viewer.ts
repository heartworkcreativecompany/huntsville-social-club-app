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
}

export type Viewer = {
  userId: string
  email: string
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
    profile,
    role,
    applicationStatus,
    membershipStatus,
    canAccessApp,
    applicationSchemaReady: schemaReady,
  }
}
