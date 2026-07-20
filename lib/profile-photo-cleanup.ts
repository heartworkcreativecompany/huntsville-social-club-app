import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { APPLICATION_PHOTOS_BUCKET } from '@/lib/application-photo-storage'
import { filterSafeCleanupPaths } from '@/lib/profile-photo-references'

export type ProfilePhotoCleanupResult = {
  context: string
  userId: string
  deleted: string[]
  failed: { path: string; error: string }[]
  skipped: string[]
}

/**
 * Delete member photo objects from storage when they are no longer referenced.
 * Never pass live or active-pending paths in candidatePaths without listing them
 * in protectedPaths — callers are responsible for computing safe candidates.
 */
export async function cleanupProfilePhotoStorage(
  admin: SupabaseClient<Database>,
  input: {
    userId: string
    candidatePaths: string[]
    protectedPaths: string[]
    context: string
  }
): Promise<ProfilePhotoCleanupResult> {
  const { deletable, skipped } = filterSafeCleanupPaths(
    input.userId,
    input.candidatePaths,
    input.protectedPaths
  )

  const result: ProfilePhotoCleanupResult = {
    context: input.context,
    userId: input.userId,
    deleted: [],
    failed: [],
    skipped,
  }

  if (deletable.length === 0) {
    console.info('[profile-photo-cleanup]', {
      ...result,
      message: 'No deletable paths',
    })
    return result
  }

  const { error } = await admin.storage
    .from(APPLICATION_PHOTOS_BUCKET)
    .remove(deletable)

  if (error) {
    for (const path of deletable) {
      result.failed.push({ path, error: error.message })
    }
    console.error('[profile-photo-cleanup]', {
      ...result,
      message: 'Batch delete failed',
      error: error.message,
    })
    return result
  }

  result.deleted = deletable
  console.info('[profile-photo-cleanup]', {
    context: result.context,
    userId: result.userId,
    deleted: result.deleted,
    skipped: result.skipped,
  })

  return result
}

/** Run cleanup without failing the caller's primary workflow. */
export async function cleanupProfilePhotoStorageSafe(
  admin: SupabaseClient<Database> | null,
  input: Parameters<typeof cleanupProfilePhotoStorage>[1]
): Promise<ProfilePhotoCleanupResult | null> {
  if (!admin) {
    console.error('[profile-photo-cleanup]', {
      context: input.context,
      userId: input.userId,
      message: 'Admin client unavailable — skipped storage cleanup',
    })
    return null
  }

  try {
    return await cleanupProfilePhotoStorage(admin, input)
  } catch (error) {
    console.error('[profile-photo-cleanup]', {
      context: input.context,
      userId: input.userId,
      message: 'Unexpected cleanup error',
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
