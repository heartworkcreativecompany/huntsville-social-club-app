import Link from 'next/link'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { loadProfileAccountEmails } from '@/lib/load-profile-account-emails'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'
import { createClient } from '@/lib/supabase/server'
import EventAccessInfo from '@/components/events/event-access-info'
import EventGuestInviteControls from '@/components/events/event-guest-invite-controls'
import EventMetaBadges from '@/components/events/event-meta-badges'
import EventRsvpCounts from '@/components/events/event-rsvp-counts'
import EventTypeBadge from '@/components/events/event-type-badge'
import Card from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import { formatEventDate } from '@/lib/event-labels'
import {
  eventCoverImage,
  isRemoteEventCoverImage,
} from '@/lib/event-images'
import { isEventPast, memberGoingLabel, availabilityLabel } from '@/lib/event-display'
import {
  EVENT_AT_CAPACITY_MESSAGE,
  formatAttendanceMaxLabel,
  isEventAtCapacity,
} from '@/lib/event-attendance'
import { loadMemberEntitlementsForViewer } from '@/lib/load-member-entitlements'
import { evaluateEventRegistration } from '@/lib/membership-entitlements'
import type { EventAccessType } from '@/lib/membership-tier-config'
import { getViewer } from '@/lib/viewer'
import EventEditForm from '../event-edit-form'
import EventRsvp from '../event-rsvp'
import DeleteEventButton from './delete-event-button'
import EventSponsorButton from '@/components/events/event-sponsor-button'
import ExportAttendeesCsv, {
  type AttendeeExportRow,
} from './export-attendees-csv'

type ProfileRow = {
  id: string
  full_name: string | null
}

function memberLabel(profile: ProfileRow | undefined): string {
  if (!profile) return 'Unknown member'
  if (profile.full_name) return profile.full_name
  return 'Member'
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
      'id, owner_id, title, description, location, starts_at, ends_at, visibility, status, created_at, event_type, sponsorship_eligible, priority_rsvp_opens_at, general_rsvp_opens_at, fee_cents, attendance_max, cover_image_url'
    )
    .eq('id', id)
    .single()

  if (eventError || !event) {
    return (
      <EmptyState
        title="Event not found"
        description="This event may have been removed or is no longer available."
        action={
          <Link href="/events" className="text-sm font-medium text-accent underline">
            Back to events
          </Link>
        }
      />
    )
  }

  const { data: creator } = await supabase
    .from(MEMBER_PROFILES_VIEW)
    .select('id, full_name')
    .eq('id', event.owner_id)
    .single()

  const userRole = viewer.role
  const canExportAttendees =
    user.id === event.owner_id || userRole === 'admin'

  const { data: attendeeRows } = await supabase
    .from('event_attendees')
    .select(
      'event_id, user_id, status, created_at, guest_name, guest_invite_consumed'
    )
    .eq('event_id', event.id)

  const attendeeUserIds = [
    ...new Set((attendeeRows ?? []).map((row) => row.user_id)),
  ]

  const attendeeProfilesById: Record<string, ProfileRow> = {}

  if (attendeeUserIds.length > 0) {
    const { data: attendeeProfiles } = await supabase
      .from(MEMBER_PROFILES_VIEW)
      .select('id, full_name')
      .in('id', attendeeUserIds)

    for (const profile of attendeeProfiles ?? []) {
      attendeeProfilesById[profile.id] = profile
    }
  }

  const currentUserAttendee =
    attendeeRows?.find((row) => row.user_id === user.id) ?? null
  const currentUserStatus = currentUserAttendee?.status ?? null
  const currentGuestName = currentUserAttendee?.guest_name ?? null
  const currentGuestInviteConsumed =
    currentUserAttendee?.guest_invite_consumed === true

  const isMine = event.owner_id === user.id
  const eventType = (event.event_type ?? 'standard_event') as EventAccessType
  const isPast = isEventPast(event.starts_at, event.ends_at)
  const isCancelled = event.status === 'cancelled'

  const { entitlements } = await loadMemberEntitlementsForViewer()
  const registrationPreview = entitlements
    ? evaluateEventRegistration({
        entitlements,
        eventType,
        eventStatus: event.status,
        isGoingRsvp: true,
        priorityRsvpOpensAt: event.priority_rsvp_opens_at,
        generalRsvpOpensAt: event.general_rsvp_opens_at,
      })
    : null

  const sponsorshipEligible =
    event.sponsorship_eligible === true ||
    eventType === 'circle_social' ||
    eventType === 'premium_event'

  const { data: activeSponsorship } = sponsorshipEligible
    ? await supabase
        .from('event_sponsorships')
        .select('id, status')
        .eq('event_id', event.id)
        .in('status', ['pending_payment', 'paid', 'approved', 'claimed'])
        .maybeSingle()
    : { data: null }

  const sponsorshipAvailable =
    sponsorshipEligible &&
    eventType !== 'standard_event' &&
    !activeSponsorship &&
    !isPast &&
    !isCancelled

  const rsvpCounts = {
    going: attendeeRows?.filter((row) => row.status === 'going').length ?? 0,
    maybe: attendeeRows?.filter((row) => row.status === 'maybe').length ?? 0,
    not_going:
      attendeeRows?.filter((row) => row.status === 'not_going').length ?? 0,
  }
  const atCapacity =
    currentUserStatus !== 'going' &&
    isEventAtCapacity(rsvpCounts.going, event.attendance_max)
  const spotsLabel = availabilityLabel(rsvpCounts.going, event.attendance_max)
  const attendanceMaxLabel = formatAttendanceMaxLabel(event.attendance_max)

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

  const attendeeAccountEmails = canExportAttendees
    ? await loadProfileAccountEmails(attendeeUserIds)
    : new Map<string, string | null>()

  const exportRows: AttendeeExportRow[] = (attendeeRows ?? []).map((row) => {
    const profile = attendeeProfilesById[row.user_id]
    return {
      eventTitle: event.title,
      eventDate: eventDateLabel,
      attendeeName: profile?.full_name ?? '',
      attendeeEmail: attendeeAccountEmails.get(row.user_id) ?? '',
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
                {row.guest_name ? (
                  <span className="text-muted-foreground">
                    {' '}
                    (+ guest: {row.guest_name})
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  const coverSrc = eventCoverImage(event.id, event.cover_image_url)

  return (
    <>
      <Link
        href="/events"
        className="mb-6 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to events
      </Link>

      <div className="relative mb-8 aspect-[21/9] w-full overflow-hidden rounded-xl bg-surface-elevated">
        <Image
          src={coverSrc}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
          unoptimized={isRemoteEventCoverImage(coverSrc)}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        <div className="absolute right-0 bottom-0 left-0 p-6 sm:p-8">
          <div className="mb-3 flex flex-wrap gap-2">
            <EventTypeBadge eventType={event.event_type} />
          </div>
          <h1 className="text-display text-3xl font-semibold text-white sm:text-4xl">
            {event.title}
          </h1>
          <p className="mt-2 text-sm text-white/80">
            {formatEventDate(event.starts_at)}
            {event.location ? ` · ${event.location}` : ''}
          </p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <EventMetaBadges
          isPast={isPast}
          isCancelled={isCancelled}
          currentUserStatus={currentUserStatus}
        />
        <p className="text-sm text-muted-foreground">
          Hosted by {isMine ? 'you' : memberLabel(creator ?? undefined)}
          <span className="mx-2 text-border">·</span>
          {memberGoingLabel(rsvpCounts.going)}
          {spotsLabel ? (
            <>
              <span className="mx-2 text-border">·</span>
              {spotsLabel}
            </>
          ) : null}
          {attendanceMaxLabel && !spotsLabel ? (
            <>
              <span className="mx-2 text-border">·</span>
              {attendanceMaxLabel}
            </>
          ) : null}
        </p>
      </div>

      <EventAccessInfo
        eventType={eventType}
        entitlements={entitlements}
        registrationPreview={registrationPreview}
        isPast={isPast}
        isCancelled={isCancelled}
        feeCents={event.fee_cents}
        priorityRsvpOpensAt={event.priority_rsvp_opens_at}
        generalRsvpOpensAt={event.general_rsvp_opens_at}
      />

      {event.description ? (
        <Card className="mb-8">
          <p className="text-sm leading-relaxed text-foreground">
            {event.description}
          </p>
        </Card>
      ) : null}

      {isMine ? (
        <Card className="mb-8">
          <h2 className="text-display text-lg font-semibold">Host dashboard</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Attendance overview for your event.
          </p>
          <div className="mt-4">
            <EventRsvpCounts counts={rsvpCounts} showCaption={false} />
            {attendanceMaxLabel ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {attendanceMaxLabel}
                {spotsLabel ? ` · ${spotsLabel}` : ''}
              </p>
            ) : null}
          </div>
        </Card>
      ) : null}

      {!isPast && !isCancelled ? (
        <section className="mb-8">
          <h2 className="text-display mb-4 text-xl font-medium text-foreground">
            Your RSVP
          </h2>
          <Card>
            <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-start">
              <div>
                <EventRsvp
                  eventId={event.id}
                  eventStatus={event.status ?? 'published'}
                  currentStatus={currentUserStatus}
                  registrationPreview={registrationPreview}
                  canRegisterGoing={
                    registrationPreview?.allowed !== false && !atCapacity
                  }
                  atCapacityMessage={
                    atCapacity ? EVENT_AT_CAPACITY_MESSAGE : null
                  }
                />
                <EventGuestInviteControls
                  eventId={event.id}
                  eventType={eventType}
                  isGoing={currentUserStatus === 'going'}
                  guestName={currentGuestName}
                  guestInviteConsumed={currentGuestInviteConsumed}
                  guestInvitesRemaining={entitlements?.guestInvitesRemaining ?? 0}
                  isElite={entitlements?.productTier === 'elite_circle'}
                />
              </div>
              {sponsorshipEligible && eventType !== 'standard_event' ? (
                <div className="min-w-[200px] border-t border-border pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
                  <p className="mb-2 text-sm font-medium text-foreground">
                    Sponsor this event
                  </p>
                  <EventSponsorButton
                    eventId={event.id}
                    sponsorshipAvailable={sponsorshipAvailable}
                  />
                </div>
              ) : null}
            </div>
          </Card>
        </section>
      ) : null}

      {isMine ? (
        <section className="mb-8">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h2 className="text-display text-xl font-medium text-foreground">
              Attendee responses
            </h2>
            {canExportAttendees ? (
              <ExportAttendeesCsv filename={exportFilename} rows={exportRows} />
            ) : null}
          </div>

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
      ) : null}

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
              initialEventType={event.event_type ?? 'standard_event'}
              initialStatus={event.status}
              initialFeeCents={event.fee_cents}
              initialPriorityRsvpOpensAt={event.priority_rsvp_opens_at}
              initialGeneralRsvpOpensAt={event.general_rsvp_opens_at}
              initialAttendanceMax={event.attendance_max}
              initialCoverImageUrl={event.cover_image_url}
              isAdminEditor={userRole === 'admin'}
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
