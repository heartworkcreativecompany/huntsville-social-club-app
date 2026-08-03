/**
 * Helpers for optional events.cover_image_url.
 * Migration: supabase/migrations/20260802000002_event_cover_images.sql
 * Until that migration is applied, reads/writes must not crash the events UI.
 */

export const EVENT_SELECT_FIELDS_BASE =
  'id, owner_id, title, description, location, starts_at, ends_at, visibility, status, created_at, event_type, priority_rsvp_opens_at, general_rsvp_opens_at, attendance_max' as const

export const EVENT_SELECT_FIELDS_WITH_COVER =
  `${EVENT_SELECT_FIELDS_BASE}, cover_image_url` as const

export const EVENT_DETAIL_SELECT_FIELDS_BASE =
  'id, owner_id, title, description, location, starts_at, ends_at, visibility, status, created_at, event_type, sponsorship_eligible, priority_rsvp_opens_at, general_rsvp_opens_at, fee_cents, attendance_max' as const

export const EVENT_DETAIL_SELECT_FIELDS_WITH_COVER =
  `${EVENT_DETAIL_SELECT_FIELDS_BASE}, cover_image_url` as const

export function isMissingCoverImageColumnError(
  error: { message?: string; code?: string; details?: string; hint?: string } | null | undefined
): boolean {
  if (!error) return false
  const haystack = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return (
    haystack.includes('cover_image_url') &&
    (haystack.includes('does not exist') ||
      haystack.includes('schema cache') ||
      haystack.includes('could not find'))
  )
}

export type EventRowWithOptionalCover<T extends Record<string, unknown>> = T & {
  cover_image_url: string | null
}

export function withNullCoverImage<T extends Record<string, unknown>>(
  row: T
): EventRowWithOptionalCover<T> {
  const maybeCover = (row as { cover_image_url?: unknown }).cover_image_url

  return {
    ...row,
    cover_image_url: typeof maybeCover === 'string' ? maybeCover : null,
  }
}
