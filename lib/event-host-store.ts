import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  EVENT_HOST_SCHEMA_REQUIRED_MESSAGE,
  interpretEventHostLoad,
  isMissingEventHostSchemaError,
  type EventHostMap,
  type HostCandidate,
} from '@/lib/event-host-assignment'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'

type DbClient = SupabaseClient<Database>

export type { EventHostMap }

export async function loadEventHostMap(
  client: DbClient,
  events: readonly { id: string; owner_id: string }[]
): Promise<EventHostMap> {
  if (events.length === 0) {
    return { schemaReady: true, loadError: null, byEventId: {} }
  }

  const ids = events.map((event) => event.id)
  const primary = await client
    .from('events')
    .select('id, primary_host_id')
    .in('id', ids)

  if (primary.error || !primary.data) {
    return interpretEventHostLoad({
      events,
      primaryError: primary.error,
      primaryRows: primary.data,
      additionalError: null,
      additionalRows: [],
    })
  }

  const additional = await client
    .from('event_additional_hosts')
    .select('event_id, profile_id, sort_order')
    .in('event_id', ids)
    .order('sort_order', { ascending: true })

  return interpretEventHostLoad({
    events,
    primaryError: null,
    primaryRows: primary.data,
    additionalError: additional.error,
    additionalRows: additional.data,
  })
}

export async function loadHostCandidates(
  client: DbClient,
  hostIds: readonly string[]
): Promise<{ candidates: HostCandidate[] } | { error: string }> {
  const ids = [...new Set(hostIds)]
  if (ids.length === 0) return { candidates: [] }

  const { data, error } = await client
    .from(MEMBER_PROFILES_VIEW)
    .select('id, full_name, role, removed_at')
    .in('id', ids)

  if (error || !data) {
    return { error: 'Could not verify hosting abilities.' }
  }

  return {
    candidates: data.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      role: row.role,
      removedAt: row.removed_at,
    })),
  }
}

export function eventHostWriteError(error: {
  message: string
  code?: string
}): string {
  if (isMissingEventHostSchemaError(error)) {
    return EVENT_HOST_SCHEMA_REQUIRED_MESSAGE
  }

  const message = error.message.toLowerCase()
  if (
    error.code === '42501' ||
    message.includes('row-level security') ||
    message.includes('permission')
  ) {
    return 'You do not have permission to assign event hosts.'
  }

  if (error.code === '23505') {
    return 'That member is already assigned to this event.'
  }

  return error.message
}

export type EventWriteWithHosts = {
  title: string
  location: string | null
  startsAt: string
  description: string | null
  endsAt: string | null
  eventType: string
  status: string
  sponsorshipEligible: boolean
  attendanceMax: number | null
  coverImageUrl: string | null
  applyCoverImage: boolean
  rsvpQuestion: string | null
  rsvpQuestionRequired: boolean
  listedPublicly: boolean
  feeCents: number | null
  priorityRsvpOpensAt: string | null
  generalRsvpOpensAt: string | null
  nextPrimaryHostId: string | null
  additionalHostIds: readonly string[]
}

function eventWriteArgs(input: EventWriteWithHosts) {
  return {
    title: input.title,
    location: input.location,
    starts_at: input.startsAt,
    description: input.description,
    ends_at: input.endsAt,
    event_type: input.eventType,
    status: input.status,
    sponsorship_eligible: input.sponsorshipEligible,
    attendance_max: input.attendanceMax,
    cover_image_url: input.coverImageUrl,
    rsvp_question: input.rsvpQuestion,
    rsvp_question_required: input.rsvpQuestionRequired,
    listed_publicly: input.listedPublicly,
    fee_cents: input.feeCents,
    priority_rsvp_opens_at: input.priorityRsvpOpensAt,
    general_rsvp_opens_at: input.generalRsvpOpensAt,
    next_primary_host_id: input.nextPrimaryHostId,
    next_additional_host_ids: [...input.additionalHostIds],
  }
}

export async function createEventWithHosts(
  client: DbClient,
  input: EventWriteWithHosts
): Promise<{ eventId: string } | { error: string }> {
  const { data, error } = await client.rpc(
    'create_event_with_hosts',
    eventWriteArgs(input)
  )
  if (error) return { error: eventHostWriteError(error) }
  if (!data) return { error: 'Event was not saved.' }
  return { eventId: data }
}

export async function updateEventWithHosts(
  client: DbClient,
  eventId: string,
  input: EventWriteWithHosts
): Promise<{ error?: string }> {
  const { error } = await client.rpc('update_event_with_hosts', {
    target_event_id: eventId,
    ...eventWriteArgs(input),
    apply_cover_image: input.applyCoverImage,
  })
  if (error) return { error: eventHostWriteError(error) }
  return {}
}
