/**
 * One-way Auth display-name helpers.
 * Canonical public-facing name lives on profiles.full_name (from application
 * draft displayName). Auth user_metadata is a mirror for the Dashboard Users list only.
 */

export function normalizePublicFacingName(
  value: string | null | undefined
): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed.length > 0 ? trimmed : null
}

/** Metadata payload for supabase.auth.admin.updateUserById */
export function authDisplayNameMetadata(publicFacingName: string): {
  display_name: string
  full_name: string
} {
  return {
    display_name: publicFacingName,
    full_name: publicFacingName,
  }
}

export function shouldSyncAuthDisplayName(input: {
  publicFacingName: string | null
  existingDisplayName?: string | null
  existingFullName?: string | null
}): boolean {
  if (!input.publicFacingName) return false
  return (
    input.existingDisplayName !== input.publicFacingName ||
    input.existingFullName !== input.publicFacingName
  )
}

export type AuthDisplayNameBackfillCounts = {
  updated: number
  skipped: number
  failed: number
}

export function emptyAuthDisplayNameBackfillCounts(): AuthDisplayNameBackfillCounts {
  return { updated: 0, skipped: 0, failed: 0 }
}

export function recordAuthDisplayNameBackfillResult(
  counts: AuthDisplayNameBackfillCounts,
  result: 'updated' | 'skipped' | 'failed'
): AuthDisplayNameBackfillCounts {
  return {
    updated: counts.updated + (result === 'updated' ? 1 : 0),
    skipped: counts.skipped + (result === 'skipped' ? 1 : 0),
    failed: counts.failed + (result === 'failed' ? 1 : 0),
  }
}
