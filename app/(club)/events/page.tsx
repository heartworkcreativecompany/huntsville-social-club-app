import { redirect } from 'next/navigation'
import { loadProfileAccountEmails } from '@/lib/load-profile-account-emails'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'
import { createClient } from '@/lib/supabase/server'
import EmptyState from '@/components/ui/empty-state'
import PageHeader from '@/components/ui/page-header'
import EventsBrowser, {
  type EventBrowserItem,
} from '@/components/events/events-browser'
import { listSponsorsForAdmin } from '@/lib/event-sponsors'
import EventForm from './event-form'
import { getViewer } from '@/lib/viewer'
import { loadMemberEntitlementsForViewer } from '@/lib/load-member-entitlements'
import { evaluateEventRegistration } from '@/lib/membership-entitlements'
import type { EventAccessType } from '@/lib/membership-tier-config'
import {
  EVENT_SELECT_FIELDS_BASE,
  EVENT_SELECT_FIELDS_WITH_COVER,
  isMissingCoverImageColumnError,
  withNullCoverImage,
} from '@/lib/event-cover-image-column'

type ProfileRow = {
  id: string
  full_name: string | null
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

function memberLabel(profile: ProfileRow | undefined): string {
  if (!profile) return 'Unknown member'
  if (profile.full_name) return profile.full_name
  return 'Member'
}

function creatorLabel(
  ownerId: string,
  profilesById: Record<string, ProfileRow>,
  isMine: boolean
): string {
  if (isMine) return 'You'
  return memberLabel(profilesById[ownerId])
}

type RsvpCounts = {
  going: number
  maybe: number
  not_going: number
}

export default async function EventsPage() {
  const viewer = await getViewer()

  if (!viewer) {
    redirect('/login')
  }

  if (!viewer.canAccessApp) {
    redirect('/application')
  }

  const supabase = await createClient()
  const user = { id: viewer.userId }
  const userRole = viewer.role
  const { entitlements } = await loadMemberEntitlementsForViewer()
  const isAdminCreator = userRole === 'host' || userRole === 'admin'
  const canManageSponsors = userRole === 'admin'
  const canCreateEvents =
    isAdminCreator || Boolean(entitlements?.canCreateStandardEvents)
  const availableSponsors = canManageSponsors
    ? await listSponsorsForAdmin(supabase)
    : []

  let { data: events, error } = await supabase
    .from('events')
    .select(EVENT_SELECT_FIELDS_WITH_COVER)
    .order('starts_at', { ascending: true })

  if (error && isMissingCoverImageColumnError(error)) {
    const fallback = await supabase
      .from('events')
      .select(EVENT_SELECT_FIELDS_BASE)
      .order('starts_at', { ascending: true })
    events = (fallback.data ?? []).map((row) => withNullCoverImage(row))
    error = fallback.error
  }

  const visibleEvents =
    events?.filter((event) => canViewEvent(event, user.id, userRole)) ?? []

  const ownerIds = [...new Set(visibleEvents.map((event) => event.owner_id))]
  const profilesById: Record<string, ProfileRow> = {}

  if (ownerIds.length > 0) {
    const { data: profiles } = await supabase
      .from(MEMBER_PROFILES_VIEW)
      .select('id, full_name')
      .in('id', ownerIds)

    for (const profile of profiles ?? []) {
      profilesById[profile.id] = profile
    }
  }

  const eventIds = visibleEvents.map((event) => event.id)
  const rsvpCountsByEvent: Record<string, RsvpCounts> = {}
  const currentUserStatusByEvent: Record<string, string | null> = {}

  if (eventIds.length > 0) {
    const { data: attendeeRows } = await supabase
      .from('event_attendees')
      .select('event_id, user_id, status')
      .in('event_id', eventIds)

    for (const row of attendeeRows ?? []) {
      if (row.user_id === user.id) {
        currentUserStatusByEvent[row.event_id] = row.status
      }

      if (!rsvpCountsByEvent[row.event_id]) {
        rsvpCountsByEvent[row.event_id] = { going: 0, maybe: 0, not_going: 0 }
      }

      if (row.status === 'going') {
        rsvpCountsByEvent[row.event_id].going += 1
      } else if (row.status === 'maybe') {
        rsvpCountsByEvent[row.event_id].maybe += 1
      } else if (row.status === 'not_going') {
        rsvpCountsByEvent[row.event_id].not_going += 1
      }
    }
  }

  const browserEvents: EventBrowserItem[] = visibleEvents.map((event) => ({
    id: event.id,
    title: event.title,
    location: event.location,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    description: event.description,
    status: event.status ?? 'published',
    event_type: event.event_type,
    attendance_max: event.attendance_max ?? null,
    cover_image_url: event.cover_image_url ?? null,
    creatorLabel: creatorLabel(
      event.owner_id,
      profilesById,
      event.owner_id === user.id
    ),
    counts: rsvpCountsByEvent[event.id] ?? {
      going: 0,
      maybe: 0,
      not_going: 0,
    },
    currentUserStatus: currentUserStatusByEvent[event.id] ?? null,
    registrationPreview: entitlements
      ? evaluateEventRegistration({
          entitlements,
          eventType: (event.event_type ?? 'standard_event') as EventAccessType,
          eventStatus: event.status,
          isGoingRsvp: true,
          priorityRsvpOpensAt: event.priority_rsvp_opens_at,
          generalRsvpOpensAt: event.general_rsvp_opens_at,
        })
      : null,
  }))

  return (
    <>
      <PageHeader
        eyebrow="Nights out"
        title="Events"
        description="Mixers, speed dating, and curated socials worth showing up for."
      />

      {canCreateEvents ? (
        <section className="mb-10">
          <h2 className="text-display mb-4 text-xl font-semibold">Create event</h2>
          <EventForm
            isAdminCreator={isAdminCreator}
            canManageSponsors={canManageSponsors}
            availableSponsors={availableSponsors}
            canCreateStandardOnly={!isAdminCreator}
          />
        </section>
      ) : null}

      {error ? (
        <p className="text-sm text-danger">Could not load events: {error.message}</p>
      ) : visibleEvents.length === 0 ? (
        <EmptyState
          title="No events yet"
          description="Programming from the club will appear here as it is announced."
        />
      ) : (
        <EventsBrowser events={browserEvents} />
      )}
    </>
  )
}
