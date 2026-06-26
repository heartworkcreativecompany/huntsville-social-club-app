import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Card from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import PageHeader from '@/components/ui/page-header'
import EventRichCard from '@/components/events/event-rich-card'
import { applicationStatusLabel } from '@/lib/application'
import EventForm from './event-form'
import { getViewer } from '@/lib/viewer'

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

export default async function EventsPage() {
  const viewer = await getViewer()

  if (!viewer) {
    redirect('/login')
  }

  if (!viewer.canAccessApp) {
    redirect('/application')
  }

  const supabase = await createClient()
  const user = { id: viewer.userId, email: viewer.email }
  const userRole = viewer.role
  const canCreateEvents = userRole === 'host' || userRole === 'admin'

  const { data: events, error } = await supabase
    .from('events')
    .select(
      'id, owner_id, title, description, location, starts_at, ends_at, visibility, status, created_at'
    )
    .order('starts_at', { ascending: true })

  const visibleEvents =
    events?.filter((event) => canViewEvent(event, user.id, userRole)) ?? []

  const upcomingEvents = visibleEvents.filter(
    (event) => new Date(event.starts_at).getTime() >= Date.now() - 1000 * 60 * 60 * 12
  )
  const myEvents = upcomingEvents.filter((event) => event.owner_id === user.id)
  const clubEvents = upcomingEvents.filter((event) => event.owner_id !== user.id)

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

  const eventIds = upcomingEvents.map((event) => event.id)
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
    <>
      <PageHeader
        eyebrow="Nights out"
        title="Events"
        description="Mixers, speed dating, and curated socials worth showing up for — RSVP in one tap."
      />

      <Card className="mb-8" padding="sm">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Your status: {applicationStatusLabel(viewer.applicationStatus)}
          {canCreateEvents ? ' · You can host events' : ''}
        </p>
      </Card>

      {canCreateEvents ? (
        <section className="mb-10">
          <h2 className="text-display mb-4 text-xl font-semibold">Create event</h2>
          <EventForm userId={user.id} />
        </section>
      ) : null}

      {error ? (
        <p className="text-sm text-danger">Could not load events: {error.message}</p>
      ) : (
        <>
          {myEvents.length > 0 ? (
            <section className="mb-12">
              <h2 className="text-display mb-4 text-xl font-semibold">Your events</h2>
              <ul className="grid gap-6 lg:grid-cols-2">
                {myEvents.map((event) => (
                  <li key={event.id}>
                    <EventRichCard
                      event={event}
                      creatorLabel={creatorLabel(event.owner_id, profilesById, true)}
                      counts={
                        rsvpCountsByEvent[event.id] ?? {
                          going: 0,
                          maybe: 0,
                          not_going: 0,
                        }
                      }
                      currentUserStatus={currentUserStatusByEvent[event.id] ?? null}
                      userId={user.id}
                      userRole={userRole}
                      applicationStatus={viewer.applicationStatus}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <h2 className="text-display mb-4 text-xl font-semibold">Upcoming</h2>
            {clubEvents.length === 0 ? (
              <EmptyState
                title="No upcoming events"
                description="Published programming from hosts will appear here."
              />
            ) : (
              <ul className="grid gap-6 lg:grid-cols-2">
                {clubEvents.map((event) => (
                  <li key={event.id}>
                    <EventRichCard
                      event={event}
                      creatorLabel={creatorLabel(
                        event.owner_id,
                        profilesById,
                        false
                      )}
                      counts={
                        rsvpCountsByEvent[event.id] ?? {
                          going: 0,
                          maybe: 0,
                          not_going: 0,
                        }
                      }
                      currentUserStatus={currentUserStatusByEvent[event.id] ?? null}
                      userId={user.id}
                      userRole={userRole}
                      applicationStatus={viewer.applicationStatus}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  )
}
