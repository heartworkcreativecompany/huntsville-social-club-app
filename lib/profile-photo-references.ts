import type { ApplicationPhoto } from '@/lib/application'

export function storagePathsFromPhotos(photos: ApplicationPhoto[]): string[] {
  return photos
    .map((photo) => photo.storagePath.trim())
    .filter((path) => path.length > 0)
}

export function uniqueStoragePaths(paths: string[]): string[] {
  return [...new Set(paths.map((path) => path.trim()).filter(Boolean))]
}

/** Paths in `candidate` that are not in `reference`. */
export function storagePathsNotInReference(
  candidate: ApplicationPhoto[],
  reference: ApplicationPhoto[]
): string[] {
  const referenceSet = new Set(storagePathsFromPhotos(reference))
  return uniqueStoragePaths(
    storagePathsFromPhotos(candidate).filter((path) => !referenceSet.has(path))
  )
}

/** Pending-only uploads: in pending revision but not on the live approved profile. */
export function pendingOnlyStoragePaths(
  livePhotos: ApplicationPhoto[],
  pendingPhotos: ApplicationPhoto[]
): string[] {
  return storagePathsNotInReference(pendingPhotos, livePhotos)
}

/** Live photos replaced or removed when a pending photo set is approved. */
export function replacedLiveStoragePaths(
  livePhotos: ApplicationPhoto[],
  nextLivePhotos: ApplicationPhoto[]
): string[] {
  return storagePathsNotInReference(livePhotos, nextLivePhotos)
}

/**
 * Orphaned pending-only uploads superseded by a newer pending submission
 * (not live, not in the next pending set).
 */
export function supersededPendingStoragePaths(input: {
  livePhotos: ApplicationPhoto[]
  previousPendingPhotos: ApplicationPhoto[] | undefined
  nextPendingPhotos: ApplicationPhoto[] | undefined
}): string[] {
  if (!input.previousPendingPhotos?.length) return []

  const liveSet = new Set(storagePathsFromPhotos(input.livePhotos))
  const nextSet = new Set(
    storagePathsFromPhotos(input.nextPendingPhotos ?? [])
  )

  return uniqueStoragePaths(
    storagePathsFromPhotos(input.previousPendingPhotos).filter(
      (path) => !liveSet.has(path) && !nextSet.has(path)
    )
  )
}

export function isUserScopedStoragePath(
  userId: string,
  storagePath: string
): boolean {
  const normalized = storagePath.trim()
  return (
    normalized.length > 0 &&
    normalized.startsWith(`${userId}/`) &&
    !normalized.includes('..')
  )
}

export function filterSafeCleanupPaths(
  userId: string,
  candidatePaths: string[],
  protectedPaths: string[]
): { deletable: string[]; skipped: string[] } {
  const protectedSet = new Set(protectedPaths)
  const deletable: string[] = []
  const skipped: string[] = []

  for (const path of uniqueStoragePaths(candidatePaths)) {
    if (!isUserScopedStoragePath(userId, path)) {
      skipped.push(path)
      continue
    }
    if (protectedSet.has(path)) {
      skipped.push(path)
      continue
    }
    deletable.push(path)
  }

  return { deletable, skipped }
}
