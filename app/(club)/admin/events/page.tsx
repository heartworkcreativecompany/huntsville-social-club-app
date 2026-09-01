import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PageHeader from '@/components/ui/page-header'
import Card from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import { getViewer } from '@/lib/viewer'
import AdminEventApprovalControls from '@/components/admin/admin-event-approval-controls'
import AdminSponsorshipApproveButton from '@/components/admin/admin-sponsorship-approve-button'
import EventTypeBadge from '@/components/events/event-type-badge'
import { EVENT_SPONSORSHIP_AMOUNT_CENTS, EVENT_SPONSORSHIP_PRICE_LABEL } from '@/lib/membership-tier-config'

export default async function AdminEventsPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  if (viewer.role !== 'admin') redirect('/dashboard')

  const supabase = await createClient()

  const { data: pendingEvents } = await supabase
    .from('events')
    .select('id, title, starts_at, location, event_type, owner_id, created_at, attendance_max')
    .eq('status', 'pending_approval')
    .order('created_at', { ascending: true })

  const { data: sponsorships } = await supabase
    .from('event_sponsorships')
    .select(
      'id, event_id, business_name, status, amount_cents, ticket_count, paid_at, created_at'
    )
    .in('status', ['paid', 'approved', 'claimed'])
    .order('created_at', { ascending: false })
    .limit(40)

  return (
    <>
      <Link
        href="/admin/applications"
        className="mb-6 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Admin
      </Link>
      <PageHeader
        eyebrow="Admin"
        title="Events & sponsorships"
        description="Approve member-created standard events and review paid sponsorships."
      />

      <section className="mb-10">
        <h2 className="text-display mb-4 text-xl font-medium">
          Pending event approval
        </h2>
        {!pendingEvents?.length ? (
          <EmptyState
            title="No pending events"
            description="Standard events submitted by paid members will appear here."
          />
        ) : (
          <div className="grid gap-4">
            {pendingEvents.map((event) => (
              <Card key={event.id} padding="sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="mb-1">
                      <EventTypeBadge eventType={event.event_type} />
                    </div>
                    <h3 className="text-display text-lg font-medium">
                      {event.title}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {new Date(event.starts_at).toLocaleString()}
                      {event.location ? ` · ${event.location}` : ''}
                      {event.attendance_max
                        ? ` · Max ${event.attendance_max} attending`
                        : ''}
                    </p>
                  </div>
                  <AdminEventApprovalControls eventId={event.id} />
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-display mb-4 text-xl font-medium">Sponsorships</h2>
        {!sponsorships?.length ? (
          <EmptyState
            title="No sponsorships yet"
            description={`Paid ${EVENT_SPONSORSHIP_PRICE_LABEL} sponsorships for Circle Socials and Premium events appear here.`}
          />
        ) : (
          <div className="grid gap-3">
            {sponsorships.map((row) => (
              <Card key={row.id} padding="sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">
                      {row.business_name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Status: {row.status} · $
                      {((row.amount_cents ?? EVENT_SPONSORSHIP_AMOUNT_CENTS) / 100).toFixed(0)} ·{' '}
                      {row.ticket_count ?? 4} tickets
                    </p>
                  </div>
                  {row.status === 'paid' ? (
                    <AdminSponsorshipApproveButton sponsorshipId={row.id} />
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
