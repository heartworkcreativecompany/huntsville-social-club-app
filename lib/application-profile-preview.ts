import type { ApplicationDraft, ApplicationStatus } from '@/lib/application'
import { membershipIntentFromDraft } from '@/lib/application-draft-sync'
import type { DirectoryMember } from '@/lib/members-discovery'

export type ApplicationPublicProfileDetails = {
  locationArea: string | null
  occupation: string | null
  industry: string | null
  interests: string[]
  lifestyleTags: string[]
  eventInterests: string[]
  about: string | null
}

/** Maps application draft to the same directory member shape used in discovery. */
export function directoryMemberFromApplicationDraft(
  draft: ApplicationDraft,
  context: {
    userId: string
    email?: string | null
    applicationStatus: ApplicationStatus
  }
): DirectoryMember {
  return {
    id: context.userId,
    email: context.email ?? null,
    full_name: draft.profile.displayName.trim() || null,
    role: 'member',
    created_at: null,
    membership_intent: membershipIntentFromDraft(draft) || null,
    verified_at: null,
    membership_status: context.applicationStatus,
  }
}

/** Public-facing fields only — never includes private location or employer. */
export function publicProfileDetailsFromDraft(
  draft: ApplicationDraft
): ApplicationPublicProfileDetails {
  return {
    locationArea: draft.location.neighborhoodOrArea.trim() || null,
    occupation: draft.workAndInterests.occupation.trim() || null,
    industry: draft.workAndInterests.industry.trim() || null,
    interests: draft.workAndInterests.interests,
    lifestyleTags: draft.workAndInterests.lifestyleTags,
    eventInterests: draft.workAndInterests.eventInterests,
    about: membershipIntentFromDraft(draft) || null,
  }
}
