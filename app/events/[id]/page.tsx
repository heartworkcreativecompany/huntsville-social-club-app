import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EventEditForm from '../event-edit-form'
import EventRsvp from '../event-rsvp'
import DeleteEventButton from './delete-event-button'
import ExportAttendeesCsv, {
  type AttendeeExportRow,
} from './export-attendees-csv'

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

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function EventDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select(
      'id, owner_id, title, description, location, starts_at, ends_at, visibility, status, created_at'
    )
    .eq('id', id)
    .single()

  if (eventError || !event) {
    return (
      <main style={{ maxWidth: '560px', margin: '80px auto', padding: '24px' }}>
        <p>Event not found or not accessible.</p>
        <p style={{ marginTop: '16px' }}>
          <Link href="/events">Back to Events</Link>
        </p>
      </main>
    )
  }

  const { data: creator } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .eq('id', event.owner_id)
    .single()

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const userRole = currentProfile?.role ?? 'member'
  const canExportAttendees =
    user.id === event.owner_id || userRole === 'admin'

  const { data: attendeeRows } = await supabase
    .from('event_attendees')
    .select('event_id, user_id, status, created_at')
    .eq('event_id', event.id)

  const attendeeUserIds = [
    ...new Set((attendeeRows ?? []).map((row) => row.user_id)),
  ]

  const attendeeProfilesById: Record<string, ProfileRow> = {}

  if (attendeeUserIds.length > 0) {
    const { data: attendeeProfiles } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('id', attendeeUserIds)

    for (const profile of attendeeProfiles ?? []) {
      attendeeProfilesById[profile.id] = profile
    }
  }

  const currentUserStatus =
    attendeeRows?.find((row) => row.user_id === user.id)?.status ?? null

  const isMine = event.owner_id === user.id

  const totalAttendees = attendeeRows?.length ?? 0
  const totalGoing =
    attendeeRows?.filter((row) => row.status === 'going').length ?? 0
  const totalMaybe =
    attendeeRows?.filter((row) => row.status === 'maybe').length ?? 0
  const totalNotGoing =
    attendeeRows?.filter((row) => row.status === 'not_going').length ?? 0

  const goingRows =
    attendeeRows?.filter((row) => row.status === 'going') ?? []
  const maybeRows =
    attendeeRows?.filter((row) => row.status === 'maybe') ?? []
  const notGoingRows =
    attendeeRows?.filter((row) => row.status === 'not_going') ?? []

  const eventDateLabel = new Date(event.starts_at).toLocaleString()
  const exportFilename = `${event.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'event'}-attendees.csv`

  const exportRows: AttendeeExportRow[] = (attendeeRows ?? []).map((row) => {
    const profile = attendeeProfilesById[row.user_id]
    return {
      eventTitle: event.title,
      eventDate: eventDateLabel,
      attendeeName: profile?.full_name ?? '',
      attendeeEmail: profile?.email ?? '',
      rsvpStatus: row.status.replace('_', ' '),
      respondedAt: row.created_at
        ? new Date(row.created_at).toLocaleString()
        : '',
    }
  })

  return (
    <main style={{ maxWidth: '560px', margin: '80px auto', padding: '24px' }}>
      <p style={{ marginBottom: '16px' }}>
        <Link href="/events">← Back to Events</Link>
      </p>

      <h1 style={{ marginBottom: '16px' }}>{event.title}</h1>

      <div style={{ display: 'grid', gap: '8px', marginBottom: '24px' }}>
        <p style={{ margin: 0 }}>
          Created by: {isMine ? 'You' : memberLabel(creator ?? undefined)}
        </p>
        {event.description ? (
          <p style={{ margin: 0 }}>Description: {event.description}</p>
        ) : null}
        <p style={{ margin: 0 }}>
          Location: {event.location ?? 'Not provided'}
        </p>
        <p style={{ margin: 0 }}>
          Starts: {new Date(event.starts_at).toLocaleString()}
        </p>
        {event.ends_at ? (
          <p style={{ margin: 0 }}>
            Ends: {new Date(event.ends_at).toLocaleString()}
          </p>
        ) : null}
        <p style={{ margin: 0 }}>Visibility: {event.visibility}</p>
        <p style={{ margin: 0 }}>Status: {event.status ?? 'published'}</p>
        <p style={{ margin: 0 }}>
          Created: {new Date(event.created_at).toLocaleString()}
        </p>
      </div>

      {user.id === event.owner_id ? (
        <section style={{ marginBottom: '24px' }}>
          <h2 style={{ marginBottom: '12px' }}>Host Dashboard</h2>
          <div
            style={{
              padding: '16px',
              border: '1px solid #ccc',
              borderRadius: '8px',
              marginBottom: '16px',
              display: 'grid',
              gap: '8px',
            }}
          >
            <p style={{ margin: 0 }}>Total attendees: {totalAttendees}</p>
            <p style={{ margin: 0 }}>Going: {totalGoing}</p>
            <p style={{ margin: 0 }}>Maybe: {totalMaybe}</p>
            <p style={{ margin: 0 }}>Not going: {totalNotGoing}</p>
          </div>
        </section>
      ) : null}

      {user.id === event.owner_id ? (
        <section style={{ marginBottom: '24px' }}>
          <h2 style={{ marginBottom: '12px' }}>Edit Event</h2>
          <EventEditForm
            eventId={event.id}
            initialTitle={event.title}
            initialLocation={event.location}
            initialStartsAt={event.starts_at}
            initialDescription={event.description}
            initialEndsAt={event.ends_at}
            initialVisibility={event.visibility}
          />
          <DeleteEventButton eventId={event.id} />
        </section>
      ) : null}

      <section style={{ marginBottom: '24px' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '12px',
          }}
        >
          <h2 style={{ margin: 0 }}>Responses</h2>
          {canExportAttendees ? (
            <ExportAttendeesCsv
              filename={exportFilename}
              rows={exportRows}
            />
          ) : null}
        </div>
        {!attendeeRows?.length ? (
          <p>No responses yet</p>
        ) : (
          <div style={{ display: 'grid', gap: '16px' }}>
            <div>
              <h3 style={{ margin: '0 0 8px', fontSize: '16px' }}>Going</h3>
              {goingRows.length === 0 ? (
                <p style={{ margin: 0, fontSize: '14px' }}>None</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: '20px' }}>
                  {goingRows.map((row) => (
                    <li
                      key={`going-${row.user_id}`}
                      style={{ marginBottom: '4px' }}
                    >
                      {memberLabel(attendeeProfilesById[row.user_id])}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 style={{ margin: '0 0 8px', fontSize: '16px' }}>Maybe</h3>
              {maybeRows.length === 0 ? (
                <p style={{ margin: 0, fontSize: '14px' }}>None</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: '20px' }}>
                  {maybeRows.map((row) => (
                    <li
                      key={`maybe-${row.user_id}`}
                      style={{ marginBottom: '4px' }}
                    >
                      {memberLabel(attendeeProfilesById[row.user_id])}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 style={{ margin: '0 0 8px', fontSize: '16px' }}>Not going</h3>
              {notGoingRows.length === 0 ? (
                <p style={{ margin: 0, fontSize: '14px' }}>None</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: '20px' }}>
                  {notGoingRows.map((row) => (
                    <li
                      key={`not-going-${row.user_id}`}
                      style={{ marginBottom: '4px' }}
                    >
                      {memberLabel(attendeeProfilesById[row.user_id])}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 style={{ marginBottom: '12px' }}>Your RSVP</h2>
        <EventRsvp
          eventId={event.id}
          userId={user.id}
          eventStatus={event.status ?? 'published'}
          currentStatus={currentUserStatus}
        />
      </section>
    </main>
  )
}
