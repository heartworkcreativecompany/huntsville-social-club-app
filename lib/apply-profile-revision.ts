import type { ApplicationDraft } from '@/lib/application'
import { emptyDraft, parseApplicationDraft } from '@/lib/application'
import {
  memberIntentColumns,
  profileColumnsFromDraft,
} from '@/lib/application-draft-sync'
import {
  sanitizeConnectionsOpenToForStorage,
} from '@/lib/member-public-intent'
import type { ProfilePendingRevision } from '@/lib/profile-revision'

export function applyProfileRevisionToDraft(
  liveDraft: ApplicationDraft,
  revision: ProfilePendingRevision
): ApplicationDraft {
  const next = structuredClone(liveDraft)

  next.profile.displayName = revision.displayName
  next.location.neighborhoodOrArea = revision.locationArea
  next.profile.aboutMe = revision.bio
  next.profile.connectionIntents = revision.memberPublicIntents

  if (revision.interests !== undefined) {
    next.workAndInterests.interests = [...revision.interests]
  }
  if (revision.occupation !== undefined) {
    next.workAndInterests.occupation = revision.occupation
  }
  if (revision.industry !== undefined) {
    next.workAndInterests.industry = revision.industry
  }
  if (revision.lifestyleTags !== undefined) {
    next.workAndInterests.lifestyleTags = [...revision.lifestyleTags]
  }
  if (revision.eventInterests !== undefined) {
    next.workAndInterests.eventInterests = [...revision.eventInterests]
  }
  if (revision.socialVibe !== undefined) {
    next.workAndInterests.socialVibe = revision.socialVibe
  }
  if (revision.connectionsOpenTo !== undefined) {
    next.profile.connectionsOpenTo = sanitizeConnectionsOpenToForStorage(
      revision.connectionsOpenTo,
      revision.memberPublicIntents
    )
  }
  if (revision.perfectWeekend !== undefined) {
    next.prompts.perfectWeekend = revision.perfectWeekend
  }
  if (revision.favoriteLocalActivities !== undefined) {
    next.prompts.favoriteLocalActivities = revision.favoriteLocalActivities
  }
  if (revision.icebreaker !== undefined) {
    next.prompts.icebreaker = revision.icebreaker
  }

  if (revision.photos !== undefined) {
    next.photos = revision.photos
  }

  return next
}

export function liveProfileColumnsFromRevision(
  liveDraftJson: unknown,
  revision: ProfilePendingRevision
) {
  const liveDraft = liveDraftJson
    ? parseApplicationDraft(liveDraftJson)
    : emptyDraft()

  const mergedDraft = applyProfileRevisionToDraft(liveDraft, revision)
  const columns = profileColumnsFromDraft(mergedDraft)
  const intentColumns = memberIntentColumns(revision.memberPublicIntents)

  return {
    ...columns,
    ...intentColumns,
    membership_intent: revision.bio || columns.membership_intent,
  }
}
