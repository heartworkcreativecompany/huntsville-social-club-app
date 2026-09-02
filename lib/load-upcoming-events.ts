import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  EVENT_SELECT_FIELDS_BASE,
  EVENT_SELECT_FIELDS_WITH_COVER,
  isMissingCoverImageColumnError,
  withNullCoverImage,
} from '@/lib/event-cover-image-column'
import { isEventUpcoming } from '@/lib/event-display'

export const UPCOMING_EVENTS_PREVIEW_LIMIT = 3

export type UpcomingEventPreview = {
  id: string
  title: string
  location: string | null
  starts_at: string
  event_type: string | null
  status: string
}

export type UpcomingEventSourceRow = {
  id: string
  owner_id: string
  title: string
  location: string | null
  starts_at: string
  status: string | null
  event_type?: string | null
}

function canViewEvent(
  event: { owner_id: string; status: string | null },
  userId: string,
  userRole: string
) {
  if (userRole === 'admin') return true
  if (event.owner_id === userId) return true

  const status = event.status ?? 'published'
  return status === 'published' || status === 'cancelled'
}

export function selectUpcomingEventPreviews(
  events: UpcomingEventSourceRow[],
  input: { userId: string; role: string },
  limit = UPCOMING_EVENTS_PREVIEW_LIMIT
): UpcomingEventPreview[] {
  return events
    .filter((event) => canViewEvent(event, input.userId, input.role))
    .filter((event) => isEventUpcoming(event.starts_at, event.status))
    .sort(
      (left, right) =>
        new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime()
    )
    .slice(0, limit)
    .map((event) => ({
      id: event.id,
      title: event.title,
      location: event.location,
      starts_at: event.starts_at,
      event_type: event.event_type ?? null,
      status: event.status ?? 'published',
    }))
}

export async function loadUpcomingEventsPreview(
  supabase: SupabaseClient<Database>,
  input: { userId: string; role: string }
): Promise<{ events: UpcomingEventPreview[]; error: string | null }> {
  const nowIso = new Date().toISOString()
  let { data: events, error } = await supabase
    .from('events')
    .select(EVENT_SELECT_FIELDS_WITH_COVER)
    .gte('starts_at', nowIso)
    .order('starts_at', { ascending: true })

  if (error && isMissingCoverImageColumnError(error)) {
    const fallback = await supabase
      .from('events')
      .select(EVENT_SELECT_FIELDS_BASE)
      .gte('starts_at', nowIso)
      .order('starts_at', { ascending: true })
    events = (fallback.data ?? []).map((row) => withNullCoverImage(row))
    error = fallback.error
  }

  if (error) {
    return { events: [], error: error.message }
  }

  return {
    events: selectUpcomingEventPreviews(
      (events ?? []) as UpcomingEventSourceRow[],
      input
    ),
    error: null,
  }
}
