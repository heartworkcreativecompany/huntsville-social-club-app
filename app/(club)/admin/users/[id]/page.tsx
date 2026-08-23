import Link from 'next/link'
import { redirect } from 'next/navigation'
import AdminMemberBadgesManager from '@/components/admin/admin-member-badges-manager'
import AdminMembershipAccessOverride from '@/components/admin/admin-membership-access-override'
import ApplicationStatusBadge from '@/components/application/application-status-badge'
import MemberPhotoDisplay from '@/components/members/member-photo-display'
import MemberRecognitionBadges from '@/components/members/member-recognition-badges'
import Badge from '@/components/ui/badge'
import Card from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import PageHeader from '@/components/ui/page-header'
import { loadAdminMemberDetail } from '@/lib/admin/member-detail'
import { requireAdminClient } from '@/lib/supabase/require-admin-client'
import { getViewer } from '@/lib/viewer'

type PageProps = {
  params: Promise<{ id: string }>
}

function formatTimestamp(value: string | null): string {
  if (!value) return '—'
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return '—'
  return new Date(parsed).toLocaleString()
}

export default async function AdminMemberDetailPage({ params }: PageProps) {
  const { id } = await params
  const viewer = await getViewer()

  if (!viewer) {
    redirect('/login')
  }

  if (viewer.role !== 'admin') {
    return (
      <EmptyState
        title="Operations access required"
        description="This area is limited to club administrators."
        action={
          <Link href="/home" className="text-sm font-medium text-accent underline">
            Return home
          </Link>
        }
      />
    )
  }

  const result = await loadAdminMemberDetail(requireAdminClient(), {
    isAdmin: true,
    memberId: id,
  })

  if (!result.ok) {
    return (
      <EmptyState
        title="Could not load member"
        description={result.error}
        action={
          <Link
            href="/admin/users"
            className="text-sm font-medium text-accent underline"
          >
            Back to users
          </Link>
        }
      />
    )
  }

  const { overview, badges, accessOverride } = result.data
  const publicBadges = badges.activeAwards.map((award) => ({
    slug: award.slug,
    publicLabel: award.publicLabel,
  }))

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title={overview.fullName}
        description="Internal member overview. Public profile fields are read-only here. Recognition badges and complimentary access do not change Stripe billing."
      />
      <p className="mb-6">
        <Link
          href="/admin/users"
          className="text-sm font-medium text-accent underline"
        >
          ← Back to users
        </Link>
      </p>

      <div className="grid gap-6">
        <Card>
          <div className="flex flex-wrap items-start gap-4">
            <div className="w-20 shrink-0">
              <MemberPhotoDisplay
                memberId={overview.id}
                photo={overview.primaryPhoto}
                size="thumb"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-display text-xl font-semibold">
                  {overview.publicName}
                </h2>
                <ApplicationStatusBadge status={overview.applicationStatus} />
                <Badge variant="accent">{overview.role}</Badge>
                {overview.publicProfileStatus === 'public' ? (
                  <Badge variant="success">Public profile</Badge>
                ) : (
                  <Badge variant="muted">Not on public directory</Badge>
                )}
              </div>
              {overview.email ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {overview.email}
                </p>
              ) : null}
              {overview.cityArea ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {overview.cityArea}
                </p>
              ) : null}
              <div className="mt-3">
                <MemberRecognitionBadges badges={publicBadges} />
              </div>
            </div>
          </div>

          {overview.bio ? (
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Bio: </span>
              {overview.bio}
            </p>
          ) : null}

          {overview.intents.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {overview.intents.map((intent) => (
                <Badge key={intent.value} variant="category">
                  {intent.label}
                </Badge>
              ))}
            </div>
          ) : null}

          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Identity verification</dt>
              <dd className="font-medium text-foreground">
                {overview.identityVerificationLabel}
                {overview.identityVerifiedAt
                  ? ` · ${formatTimestamp(overview.identityVerifiedAt)}`
                  : null}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Membership display</dt>
              <dd className="font-medium text-foreground">
                {overview.membershipDisplayStatus}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Messaging</dt>
              <dd className="font-medium text-foreground">
                {overview.messagingSuspended
                  ? `Suspended${
                      overview.messagingSuspensionReason
                        ? ` — ${overview.messagingSuspensionReason}`
                        : ''
                    }`
                  : 'Not suspended'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Profile revision</dt>
              <dd className="font-medium text-foreground">
                {overview.profileRevisionStatus ?? 'None'}
              </dd>
            </div>
          </dl>

          <p className="mt-5 text-sm text-muted-foreground">
            Public profile content is member-entered and cannot be overwritten
            here.{' '}
            <Link
              href={`/admin/applications/${overview.id}`}
              className="font-medium text-accent underline"
            >
              Review application
            </Link>
            {' · '}
            <Link
              href="/admin/profile-revisions"
              className="font-medium text-accent underline"
            >
              Profile revision queue
            </Link>
          </p>
        </Card>

        <Card>
          <h3 className="text-display text-base font-semibold">
            Stripe subscription (read-only)
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Billing remains Stripe/coupon-driven. This page never edits
            subscription, payment, or coupon state.
          </p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Stripe status</dt>
              <dd className="font-medium text-foreground">
                {overview.stripeSubscription.statusLabel}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Subscription state</dt>
              <dd className="font-medium text-foreground">
                {overview.stripeSubscription.subscriptionStatus}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Plan</dt>
              <dd className="font-medium text-foreground">
                {overview.stripeSubscription.plan ?? 'None'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Cycle end</dt>
              <dd className="font-medium text-foreground">
                {formatTimestamp(overview.stripeSubscription.cycleEnd)}
              </dd>
            </div>
          </dl>
        </Card>

        <AdminMembershipAccessOverride
          memberId={overview.id}
          memberName={overview.fullName}
          override={accessOverride}
        />

        <AdminMemberBadgesManager state={badges} embedded />
      </div>
    </>
  )
}
