import type { ApplicationDraft } from '@/lib/application'
import type { ViewerProfile } from '@/lib/viewer'
import { photosFromApplicationDraft } from '@/lib/member-photos'
import { isMemberPubliclyVerified, parseVerificationState } from '@/lib/membership-systems'

export type ProfileCompletionItem = {
  key: string
  label: string
  done: boolean
}

export function computeProfileCompletion(
  profile: ViewerProfile | null,
  draft: ApplicationDraft
): { percent: number; items: ProfileCompletionItem[] } {
  const photos = photosFromApplicationDraft(draft)
  const verification = parseVerificationState(profile?.verification_state)

  const items: ProfileCompletionItem[] = [
    {
      key: 'photo',
      label: 'Profile photo',
      done: photos.length > 0,
    },
    {
      key: 'name',
      label: 'Display name',
      done: Boolean(
        draft.profile.displayName.trim() || profile?.full_name?.trim()
      ),
    },
    {
      key: 'intent',
      label: 'Connection intent',
      done: Boolean(draft.profile.lookingFor.trim()),
    },
    {
      key: 'bio',
      label: 'About you',
      done: Boolean(
        draft.prompts.hopingToMeet.trim() || profile?.membership_intent?.trim()
      ),
    },
    {
      key: 'location',
      label: 'Location area',
      done: Boolean(
        draft.location.neighborhoodOrArea.trim() || profile?.location_area?.trim()
      ),
    },
    {
      key: 'interests',
      label: 'Interests',
      done:
        (profile?.discovery_interests ?? []).some((i) => i.trim()) ||
        Boolean(draft.prompts.favoriteLocalActivities.trim()),
    },
    {
      key: 'verification',
      label: 'Verification complete',
      done: isMemberPubliclyVerified(verification),
    },
  ]

  const doneCount = items.filter((item) => item.done).length
  const percent = Math.round((doneCount / items.length) * 100)

  return { percent, items }
}
