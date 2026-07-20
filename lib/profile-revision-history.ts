import type { ProfilePendingRevision } from '@/lib/profile-revision'

export type ProfileRevisionHistoryEntry = {
  status: 'approved' | 'rejected'
  submittedAt: string
  reviewedAt: string
  adminNotes: string | null
  changedFields: string[]
  revision: ProfilePendingRevision
}

const HISTORY_MAX_ENTRIES = 20

export function parseProfileRevisionHistory(value: unknown): ProfileRevisionHistoryEntry[] {
  if (!Array.isArray(value)) return []

  return value
    .filter((item): item is ProfileRevisionHistoryEntry => {
      if (!item || typeof item !== 'object') return false
      const raw = item as Record<string, unknown>
      return (
        (raw.status === 'approved' || raw.status === 'rejected') &&
        typeof raw.reviewedAt === 'string'
      )
    })
    .slice(-HISTORY_MAX_ENTRIES)
}

export function appendProfileRevisionHistory(
  existing: unknown,
  entry: ProfileRevisionHistoryEntry
): ProfileRevisionHistoryEntry[] {
  const history = parseProfileRevisionHistory(existing)
  return [...history, entry].slice(-HISTORY_MAX_ENTRIES)
}
