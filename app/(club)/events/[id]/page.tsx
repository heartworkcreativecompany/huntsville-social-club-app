import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EventEligibilityBanner from '@/components/events/event-eligibility-banner'
import EventGatingScaffold from '@/components/events/event-gating-scaffold'
import EventRsvpCounts from '@/components/events/event-rsvp-counts'
import EventStatusBadge from '@/components/events/event-status-badge'
import EventTierBadge from '@/components/events/event-tier-badge'
import Card from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import { formatEventDate } from '@/lib/event-labels'
import { resolveEventEligibility } from '@/lib/event-eligibility'
import { getViewer } from '@/lib/viewer'
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
  const viewer = await getViewer()

  if (!viewer) {
    redirect('/login')
  }

  if (!viewer.canAccessApp) {
    redirect('/application')
  }

  const supabase = await createClient()
  const user = { id: viewer.userId }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select(
      'id, owner_id, title, description, location, starts_at, ends_at, visibility, status, created_at'
    )
    .eq('id', id)
    .single()

  if (eventError || !event) {
    return (
      <>
        <EmptyState
          title="Event not found"
          description="This event may be private, removed, or unavailable to your account."
          action={
            <Link href="/events" className="text-sm font-medium text-accent underline">
              Back to events
            </Link>
          }
        />
      </>
    )
  }

  const { data: creator } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .eq('id', event.owner_id)
    .single()

  const userRole = viewer.role
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

  const eligibility = resolveEventEligibility(
    { status: event.status, visibility: event.visibility },
    { applicationStatus: viewer.applicationStatus, role: userRole }
  )

  const rsvpCounts = {
    going: attendeeRows?.filter((row) => row.status === 'going').length ?? 0,
    maybe: attendeeRows?.filter((row) => row.status === 'maybe').length ?? 0,
    not_going:
      attendeeRows?.filter((row) => row.status === 'not_going').length ?? 0,
  }

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

  function AttendeeList({
    title,
    rows,
  }: {
    title: string
    rows: typeof goingRows
  }) {
    return (
      <div>
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">None</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {rows.map((row) => (
              <li
                key={`${title}-${row.user_id}`}
                className="text-sm text-foreground"
              >
                {memberLabel(attendeeProfilesById[row.user_id])}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <>
      <Link
        href="/events"
        className="mb-6 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to events
      </Link>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <EventTierBadge tier={eligibility.tier} />
            <EventStatusBadge status={event.status} />
          </div>
          <h1 className="text-display text-3xl font-medium text-foreground sm:text-4xl">
            {event.title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Hosted by {isMine ? 'you' : memberLabel(creator ?? undefined)}
          </p>
        </div>
      </div>

      <div className="mb-8">
        <EventEligibilityBanner eligibility={eligibility} />
        <EventGatingScaffold eligibility={eligibility} />
      </div>

      <Card className="mb-8">
        {event.description ? (
          <p className="text-sm leading-relaxed text-foreground">
            {event.description}
          </p>
        ) : null}
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">When</dt>
            <dd className="font-medium text-foreground">
              {formatEventDate(event.starts_at)}
            </dd>
          </div>
          {event.ends_at ? (
            <div>
              <dt className="text-muted-foreground">Ends</dt>
              <dd className="font-medium text-foreground">
                {formatEventDate(event.ends_at)}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-muted-foreground">Location</dt>
            <dd className="font-medium text-foreground">
              {event.location ?? 'Not provided'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Access tier</dt>
            <dd className="font-medium text-foreground">
              {eligibility.tierLabel}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Visibility</dt>
            <dd className="font-medium capitalize text-foreground">
              {event.visibility}
            </dd>
          </div>
        </dl>
      </Card>

      {isMine ? (
        <Card className="mb-8">
          <h2 className="text-display text-lg font-medium text-foreground">
            Host dashboard
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Operational view for your gathering — export and check-in tools will
            expand here.
          </p>
          <div className="mt-4">
            <EventRsvpCounts counts={rsvpCounts} showCaption={false} />
          </div>
        </Card>
      ) : null}

      <section className="mb-8">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h2 className="text-display text-xl font-medium text-foreground">
            Attendee responses
          </h2>
          {canExportAttendees ? (
            <ExportAttendeesCsv filename={exportFilename} rows={exportRows} />
          ) : null}
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Member names appear here only — the events list shows RSVP counts for
          privacy on the calendar.
        </p>

        {!attendeeRows?.length ? (
          <EmptyState
            title="No responses yet"
            description="Member names will appear here as RSVPs come in."
          />
        ) : (
          <Card className="grid gap-6 sm:grid-cols-3">
            <AttendeeList title="Going" rows={goingRows} />
            <AttendeeList title="Maybe" rows={maybeRows} />
            <AttendeeList title="Not going" rows={notGoingRows} />
          </Card>
        )}
      </section>

      <section className="mb-8">
        <h2 className="text-display mb-1 text-xl font-medium text-foreground">
          Your RSVP
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {eligibility.rsvpMessage}
        </p>
        <Card>
          <EventRsvp
            eventId={event.id}
            userId={user.id}
            eventStatus={event.status ?? 'published'}
            currentStatus={currentUserStatus}
          />
        </Card>
      </section>

      {isMine ? (
        <section>
          <h2 className="text-display mb-4 text-xl font-medium text-foreground">
            Edit event
          </h2>
          <Card>
            <EventEditForm
              eventId={event.id}
              initialTitle={event.title}
              initialLocation={event.location}
              initialStartsAt={event.starts_at}
              initialDescription={event.description}
              initialEndsAt={event.ends_at}
              initialVisibility={event.visibility}
            />
            <div className="mt-4 border-t border-border pt-4">
              <DeleteEventButton eventId={event.id} />
            </div>
          </Card>
        </section>
      ) : null}
    </>
  )
}
