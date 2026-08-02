'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isApprovedMember } from '@/lib/application'
import { parseAttendanceMax } from '@/lib/event-attendance'
import { loadMemberEntitlementsForViewer } from '@/lib/load-member-entitlements'
import {
  parseDatetimeLocalToIso,
  parseFeeDollarsToCents,
} from '@/lib/membership-tier-config'
import { getViewer } from '@/lib/viewer'

const EVENT_TYPES = new Set([
  'standard_event',
  'circle_social',
  'premium_event',
])

const EVENT_STATUSES = new Set([
  'draft',
  'pending_approval',
  'published',
  'cancelled',
])

function isPrivilegedEventManager(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'host'
}

function getEventWriteErrorMessage(error: {
  message: string
  code?: string
}): string {
  const msg = error.message.toLowerCase()
  const isPermissionDenied =
    error.code === '42501' ||
    error.code === 'PGRST301' ||
    msg.includes('permission') ||
    msg.includes('policy') ||
    msg.includes('row-level security') ||
    msg.includes('row level security') ||
    msg.includes('not authorized') ||
    msg.includes('violates')

  if (isPermissionDenied) {
    return 'You do not have permission to save this event.'
  }

  return error.message
}

export async function createEvent(input: {
  title: string
  location: string
  startsAt: string
  description?: string
  endsAt?: string
  eventType?: string
  status?: string
  feeDollars?: string
  priorityRsvpOpensAt?: string
  generalRsvpOpensAt?: string
  attendanceMax?: string
  coverImageUrl?: string
}) {
  const viewer = await getViewer()
  if (!viewer) {
    return { error: 'You must be signed in.' }
  }
  if (!viewer.canAccessApp || !isApprovedMember(viewer.applicationStatus, viewer.role)) {
    return { error: 'Membership approval is required.' }
  }

  const privileged = isPrivilegedEventManager(viewer.role)
  if (!privileged) {
    const { entitlements } = await loadMemberEntitlementsForViewer()
    if (!entitlements?.canCreateStandardEvents) {
      return { error: 'You do not have permission to create events.' }
    }
  }

  const title = input.title.trim()
  const location = input.location.trim()
  const startsAt = input.startsAt.trim()
  if (!title || !location || !startsAt) {
    return { error: 'Title, location, and start time are required.' }
  }

  const attendanceParsed = parseAttendanceMax(input.attendanceMax)
  if ('error' in attendanceParsed) {
    return { error: attendanceParsed.error }
  }

  const coverImageUrl = input.coverImageUrl?.trim() || null
  if (coverImageUrl && !/^https?:\/\//i.test(coverImageUrl)) {
    return { error: 'Event image URL is invalid.' }
  }

  let eventType = 'standard_event'
  let status = 'pending_approval'
  let feeCents: number | null = null
  let priorityIso: string | null = null
  let generalIso: string | null = null

  if (privileged) {
    const requestedType = input.eventType?.trim() || 'standard_event'
    if (!EVENT_TYPES.has(requestedType)) {
      return { error: 'Invalid event type.' }
    }
    eventType = requestedType

    const requestedStatus = input.status?.trim() || 'published'
    if (!EVENT_STATUSES.has(requestedStatus)) {
      return { error: 'Invalid event status.' }
    }
    status = requestedStatus

    try {
      feeCents = parseFeeDollarsToCents(input.feeDollars ?? '')
      priorityIso = parseDatetimeLocalToIso(input.priorityRsvpOpensAt ?? '')
      generalIso = parseDatetimeLocalToIso(input.generalRsvpOpensAt ?? '')
    } catch (error) {
      return {
        error:
          error instanceof Error ? error.message : 'Invalid fee or RSVP window.',
      }
    }
  }

  const sponsorshipEligible =
    eventType === 'circle_social' || eventType === 'premium_event'

  const supabase = await createClient()
  const { data: newEvent, error: eventError } = await supabase
    .from('events')
    .insert({
      owner_id: viewer.userId,
      title,
      location,
      starts_at: startsAt,
      description: input.description?.trim() || null,
      ends_at: input.endsAt?.trim() || null,
      visibility: 'public',
      event_type: eventType,
      status,
      sponsorship_eligible: sponsorshipEligible,
      attendance_max: attendanceParsed.value,
      cover_image_url: coverImageUrl,
      ...(privileged
        ? {
            fee_cents: feeCents,
            priority_rsvp_opens_at: priorityIso,
            general_rsvp_opens_at: generalIso,
          }
        : {}),
    })
    .select('id')
    .single()

  if (eventError) {
    return { error: getEventWriteErrorMessage(eventError) }
  }

  if (status === 'published' && newEvent?.id) {
    const { error: attendeeError } = await supabase.from('event_attendees').upsert({
      event_id: newEvent.id,
      user_id: viewer.userId,
      status: 'going',
    })

    if (attendeeError) {
      revalidatePath('/events')
      return {
        error: `Event created, but could not add you as an attendee: ${attendeeError.message}`,
        eventId: newEvent.id,
      }
    }
  }

  revalidatePath('/events')
  revalidatePath('/admin/events')
  if (newEvent?.id) {
    revalidatePath(`/events/${newEvent.id}`)
  }

  return {
    success: true as const,
    eventId: newEvent?.id,
    status,
  }
}

export async function updateEvent(input: {
  eventId: string
  title: string
  location: string
  startsAt: string
  description?: string
  endsAt?: string
  eventType?: string
  status?: string
  feeDollars?: string
  priorityRsvpOpensAt?: string
  generalRsvpOpensAt?: string
  attendanceMax?: string
  coverImageUrl?: string
}) {
  const viewer = await getViewer()
  if (!viewer) {
    return { error: 'You must be signed in.' }
  }

  const supabase = await createClient()
  const { data: existing, error: loadError } = await supabase
    .from('events')
    .select('id, owner_id, event_type, status, visibility')
    .eq('id', input.eventId)
    .single()

  if (loadError || !existing) {
    return { error: loadError?.message ?? 'Event not found.' }
  }

  const isOwner = existing.owner_id === viewer.userId
  const isAdmin = viewer.role === 'admin'
  if (!isAdmin && !isOwner) {
    return { error: 'You do not have permission to edit this event.' }
  }

  const title = input.title.trim()
  const location = input.location.trim()
  const startsAt = input.startsAt.trim()
  if (!title || !location || !startsAt) {
    return { error: 'Title, location, and start time are required.' }
  }

  const attendanceParsed = parseAttendanceMax(input.attendanceMax)
  if ('error' in attendanceParsed) {
    return { error: attendanceParsed.error }
  }

  const coverImageUrl =
    input.coverImageUrl === undefined
      ? undefined
      : input.coverImageUrl.trim() || null
  if (coverImageUrl && !/^https?:\/\//i.test(coverImageUrl)) {
    return { error: 'Event image URL is invalid.' }
  }

  // Match edit UI: only admins manage type, status, fee, and RSVP windows.
  const canManageTypeAndFee = isAdmin

  let eventType = existing.event_type ?? 'standard_event'
  let status = existing.status
  let feePatch: Record<string, number | string | null> = {}

  if (canManageTypeAndFee) {
    const requestedType = input.eventType?.trim() || eventType
    if (!EVENT_TYPES.has(requestedType)) {
      return { error: 'Invalid event type.' }
    }
    eventType = requestedType

    if (input.status != null && input.status.trim() !== '') {
      const requestedStatus = input.status.trim()
      if (!EVENT_STATUSES.has(requestedStatus)) {
        return { error: 'Invalid event status.' }
      }
      status = requestedStatus
    }

    try {
      feePatch = {
        fee_cents: parseFeeDollarsToCents(input.feeDollars ?? ''),
        priority_rsvp_opens_at: parseDatetimeLocalToIso(
          input.priorityRsvpOpensAt ?? ''
        ),
        general_rsvp_opens_at: parseDatetimeLocalToIso(
          input.generalRsvpOpensAt ?? ''
        ),
      }
    } catch (error) {
      return {
        error:
          error instanceof Error ? error.message : 'Invalid fee or RSVP window.',
      }
    }
  }

  const sponsorshipEligible =
    eventType === 'circle_social' || eventType === 'premium_event'

  const { error } = await supabase
    .from('events')
    .update({
      title,
      location: location || null,
      starts_at: startsAt,
      description: input.description?.trim() || null,
      ends_at: input.endsAt?.trim() || null,
      visibility: 'public',
      attendance_max: attendanceParsed.value,
      updated_at: new Date().toISOString(),
      ...(coverImageUrl !== undefined ? { cover_image_url: coverImageUrl } : {}),
      ...(canManageTypeAndFee
        ? {
            event_type: eventType,
            status,
            sponsorship_eligible: sponsorshipEligible,
            ...feePatch,
          }
        : {}),
    })
    .eq('id', input.eventId)

  if (error) {
    return { error: getEventWriteErrorMessage(error) }
  }

  revalidatePath('/events')
  revalidatePath('/admin/events')
  revalidatePath(`/events/${input.eventId}`)
  return { success: true as const }
}
