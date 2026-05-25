import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DeleteEventButton from './delete-event-button'
import EventForm from './event-form'
import EventInlineEdit from './event-inline-edit'
import EventRsvp from './event-rsvp'

type EventRow = {
  id: string
  owner_id: string
  title: string
  description: string | null
  location: string | null
  starts_at: string
  ends_at: string | null
  visibility: string
  status: string
  created_at: string
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

type ProfileRow = {
  id: string
  email: string | null
  full_name: string | null
}

function memberLabel(profile: ProfileRow | undefined): string {
  if (!profile) return 'Unknown member'
  if (profile.full_name) return profile.full_name
  if (profile.email) return profile.email
  return 'Unknown member'
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

function EventCards({
  events,
  rsvpCountsByEvent,
  currentUserStatusByEvent,
  userId,
  userRole,
  profilesById,
  isMineSection,
}: {
  events: EventRow[]
  rsvpCountsByEvent: Record<string, RsvpCounts>
  currentUserStatusByEvent: Record<string, string | null>
  userId: string
  userRole: string
  profilesById: Record<string, ProfileRow>
  isMineSection: boolean
}) {
  return (
    <ul
      style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        display: 'grid',
        gap: '12px',
      }}
    >
      {events.map((event) => {
        const counts = rsvpCountsByEvent[event.id] ?? {
          going: 0,
          maybe: 0,
          not_going: 0,
        }
        const canModerate = userId === event.owner_id || userRole === 'admin'

        return (
          <li
            key={event.id}
            style={{
              padding: '12px',
              border: '1px solid #ccc',
              borderRadius: '8px',
            }}
          >
            <p style={{ margin: 0, fontWeight: 600 }}>
              <Link
                href={`/events/${event.id}`}
                style={{
                  color: 'inherit',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                {event.title}
              </Link>
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#555' }}>
              Created by:{' '}
              {creatorLabel(event.owner_id, profilesById, isMineSection)}
            </p>
            {event.location ? (
              <p style={{ margin: '4px 0 0' }}>Location: {event.location}</p>
            ) : null}
            <p style={{ margin: '4px 0 0' }}>
              Starts: {new Date(event.starts_at).toLocaleString()}
            </p>
            <p style={{ margin: '4px 0 0' }}>Visibility: {event.visibility}</p>
            <p style={{ margin: '4px 0 0', fontSize: '14px' }}>
              Status: {event.status ?? 'published'}
            </p>
            <div style={{ margin: '4px 0 0', fontSize: '14px' }}>
              <p style={{ margin: '2px 0' }}>Going: {counts.going}</p>
              <p style={{ margin: '2px 0' }}>Maybe: {counts.maybe}</p>
              <p style={{ margin: '2px 0' }}>Not going: {counts.not_going}</p>
            </div>
            <EventRsvp
              eventId={event.id}
              userId={userId}
              eventStatus={event.status ?? 'published'}
              currentStatus={currentUserStatusByEvent[event.id] ?? null}
            />
            {canModerate ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <EventInlineEdit
                  eventId={event.id}
                  initialTitle={event.title}
                  initialLocation={event.location}
                  initialStartsAt={event.starts_at}
                  initialDescription={event.description}
                  initialEndsAt={event.ends_at}
                  initialVisibility={event.visibility}
                  initialStatus={event.status ?? 'published'}
                />
                <DeleteEventButton eventId={event.id} />
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

export default async function EventsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()

  const userRole = currentProfile?.role ?? 'member'
  const canCreateEvents = userRole === 'host' || userRole === 'admin'

  const { data: events, error } = await supabase
    .from('events')
    .select(
      'id, owner_id, title, description, location, starts_at, ends_at, visibility, status, created_at'
    )
    .order('starts_at', { ascending: true })

  const visibleEvents =
    events?.filter((event) => canViewEvent(event, user.id, userRole)) ?? []

  const myEvents = visibleEvents.filter((event) => event.owner_id === user.id)
  const sharedEvents = visibleEvents.filter((event) => event.owner_id !== user.id)

  const ownerIds = [...new Set(visibleEvents.map((event) => event.owner_id))]
  const profilesById: Record<string, ProfileRow> = {}

  if (ownerIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, full_name')
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

  return (
    <main style={{ maxWidth: '560px', margin: '80px auto', padding: '24px' }}>
      <h1 style={{ marginBottom: '16px' }}>Events</h1>
      <p style={{ marginBottom: '24px' }}>Signed in as: {user.email}</p>

      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ marginBottom: '12px' }}>Create Event</h2>
        {canCreateEvents ? (
          <EventForm userId={user.id} />
        ) : (
          <p>You do not have host permissions to create events yet.</p>
        )}
      </section>

      {error ? (
        <p style={{ marginBottom: '16px', color: '#b00020' }}>
          Could not load events: {error.message}
        </p>
      ) : (
        <>
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ marginBottom: '12px' }}>My Events</h2>
            {myEvents.length === 0 ? (
              <p>No events yet.</p>
            ) : (
              <EventCards
                events={myEvents}
                rsvpCountsByEvent={rsvpCountsByEvent}
                currentUserStatusByEvent={currentUserStatusByEvent}
                userId={user.id}
                userRole={userRole}
                profilesById={profilesById}
                isMineSection
              />
            )}
          </section>

          <section>
            <h2 style={{ marginBottom: '12px' }}>Shared Events</h2>
            {sharedEvents.length === 0 ? (
              <p>No shared events yet.</p>
            ) : (
              <EventCards
                events={sharedEvents}
                rsvpCountsByEvent={rsvpCountsByEvent}
                currentUserStatusByEvent={currentUserStatusByEvent}
                userId={user.id}
                userRole={userRole}
                profilesById={profilesById}
                isMineSection={false}
              />
            )}
          </section>
        </>
      )}
    </main>
  )
}
