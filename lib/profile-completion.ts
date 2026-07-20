import type { ApplicationDraft } from '@/lib/application'
import {
  CONNECTION_LOOKING_FOR_FIELD,
  resolveMemberPublicIntents,
} from '@/lib/member-public-intent'
import { photosFromApplicationDraft } from '@/lib/member-photos'
import { isMemberPubliclyVerified, parseVerificationState } from '@/lib/membership-systems'
import type { ViewerProfile } from '@/lib/viewer'

export type ProfileCompletionItem = {
  key: string
  label: string
  done: boolean
}

/** Live approved profile fields for strength checklist — not pending revisions. */
export function computeProfileCompletion(
  profile: ViewerProfile | null,
  liveDraft: ApplicationDraft
): { percent: number; items: ProfileCompletionItem[] } {
  const livePhotos = photosFromApplicationDraft(profile?.application_draft ?? liveDraft)
  const verification = parseVerificationState(profile?.verification_state)

  const liveIntents = resolveMemberPublicIntents({
    connection_intents: profile?.connection_intents ?? null,
    connections_open_to: profile?.connections_open_to ?? null,
    discovery_intent: profile?.discovery_intent ?? null,
  })

  const liveInterests =
    (profile?.discovery_interests ?? []).filter((item) => item.trim()).length > 0
      ? profile!.discovery_interests!
      : liveDraft.workAndInterests.interests.filter((item) => item.trim())

  const items: ProfileCompletionItem[] = [
    {
      key: 'photo',
      label: 'Profile photo',
      done: livePhotos.length > 0,
    },
    {
      key: 'name',
      label: 'Display name',
      done: Boolean(
        profile?.full_name?.trim() || liveDraft.profile.displayName.trim()
      ),
    },
    {
      key: 'intent',
      label: CONNECTION_LOOKING_FOR_FIELD.label,
      done: liveIntents.length > 0,
    },
    {
      key: 'bio',
      label: 'About you',
      done: Boolean(
        profile?.membership_intent?.trim() ||
          liveDraft.prompts.hopingToMeet.trim()
      ),
    },
    {
      key: 'location',
      label: 'Location area',
      done: Boolean(
        profile?.location_area?.trim() ||
          liveDraft.location.neighborhoodOrArea.trim()
      ),
    },
    {
      key: 'interests',
      label: 'Interests',
      done: liveInterests.length >= 1,
    },
    {
      key: 'verification',
      label: 'Verified member',
      done: isMemberPubliclyVerified(verification),
    },
  ]

  const doneCount = items.filter((item) => item.done).length
  const percent = Math.round((doneCount / items.length) * 100)

  return { percent, items }
}
