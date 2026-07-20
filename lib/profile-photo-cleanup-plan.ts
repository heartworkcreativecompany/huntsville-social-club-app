import 'server-only'

import type { ApplicationPhoto } from '@/lib/application'
import { photosFromApplicationDraft } from '@/lib/member-photos'
import {
  pendingOnlyStoragePaths,
  replacedLiveStoragePaths,
  storagePathsFromPhotos,
  supersededPendingStoragePaths,
} from '@/lib/profile-photo-references'
import { parseProfilePendingRevision } from '@/lib/profile-revision'

export function rejectRevisionPhotoCleanupCandidates(input: {
  applicationDraft: unknown
  profilePendingRevision: unknown
}): string[] {
  const livePhotos = photosFromApplicationDraft(input.applicationDraft)
  const pending = parseProfilePendingRevision(input.profilePendingRevision)
  if (!pending?.photos) return []
  return pendingOnlyStoragePaths(livePhotos, pending.photos)
}

export function approveRevisionPhotoCleanupCandidates(input: {
  applicationDraft: unknown
  profilePendingRevision: unknown
}): string[] {
  const livePhotos = photosFromApplicationDraft(input.applicationDraft)
  const pending = parseProfilePendingRevision(input.profilePendingRevision)
  if (!pending?.photos) return []
  return replacedLiveStoragePaths(livePhotos, pending.photos)
}

export function supersededPendingRevisionCleanupCandidates(input: {
  applicationDraft: unknown
  previousProfilePendingRevision: unknown
  nextPendingPhotos: ApplicationPhoto[] | undefined
}): string[] {
  const livePhotos = photosFromApplicationDraft(input.applicationDraft)
  const previous = parseProfilePendingRevision(input.previousProfilePendingRevision)
  return supersededPendingStoragePaths({
    livePhotos,
    previousPendingPhotos: previous?.photos,
    nextPendingPhotos: input.nextPendingPhotos,
  })
}

export function livePhotoStoragePaths(applicationDraft: unknown): string[] {
  return storagePathsFromPhotos(photosFromApplicationDraft(applicationDraft))
}

export function pendingRevisionStoragePaths(
  profilePendingRevision: unknown
): string[] {
  const pending = parseProfilePendingRevision(profilePendingRevision)
  return storagePathsFromPhotos(pending?.photos ?? [])
}
