import type { ApplicationDraft, ApplicationStatus } from '@/lib/application'
import { membershipIntentFromDraft } from '@/lib/application-draft-sync'
import { buildDirectoryMember, type DirectoryMember } from '@/lib/members-discovery'
import {
  publicProfileDetailsFromDraft as publicProfileDetailsFromDraftImpl,
  type ApplicationPublicProfileDetails,
} from '@/lib/profile-public-display'
import { discoveryColumnsFromDraft } from '@/lib/membership-systems'

export type {
  ApplicationPublicProfileDetails,
  ProfilePromptDisplay,
} from '@/lib/profile-public-display'

/** Maps application draft to the same directory member shape used in discovery. */
export function directoryMemberFromApplicationDraft(
  draft: ApplicationDraft,
  context: {
    userId: string
    email?: string | null
    applicationStatus: ApplicationStatus
  }
): DirectoryMember {
  const discovery = discoveryColumnsFromDraft(draft)
  const member = buildDirectoryMember({
    id: context.userId,
    full_name: draft.profile.displayName.trim() || null,
    role: 'member',
    created_at: null,
    application_status: context.applicationStatus,
    membership_intent: membershipIntentFromDraft(draft) || null,
    verified_at: null,
    location_area: draft.location.neighborhoodOrArea.trim() || null,
    discovery_intent: discovery.discovery_intent,
    location_city: discovery.location_city,
    location_zip: discovery.location_zip,
    birth_year: discovery.birth_year,
    discovery_interests: discovery.discovery_interests,
    discovery_industry: discovery.discovery_industry,
  })
  member.photos = draft.photos
  return member
}

/** Public-facing fields only — never includes private location, employer, or admin notes. */
export function publicProfileDetailsFromDraft(
  draft: ApplicationDraft,
  options?: { connectionsOpenTo?: string[] | null }
): ApplicationPublicProfileDetails {
  return publicProfileDetailsFromDraftImpl(draft, options)
}
