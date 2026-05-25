import Link from 'next/link'
import Badge from '@/components/ui/badge'
import Card from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import PageHeader from '@/components/ui/page-header'
import MemberDiscoveryGrid from '@/components/members/member-discovery-grid'
import MemberProfileCard from '@/components/members/member-profile-card'
import type { DirectoryMember } from '@/lib/members-discovery'
import { loadDirectoryProfiles } from '@/lib/load-directory-profiles'
import { membershipStatusLabel } from '@/lib/membership'
import { getViewer, type ViewerProfile } from '@/lib/viewer'
import ProfileForm from './profile-form'

function toDirectoryMember(profile: ViewerProfile, email: string): DirectoryMember {
  return {
    id: profile.id,
    email: profile.email ?? email,
    full_name: profile.full_name,
    role: profile.role,
    created_at: profile.created_at,
    membership_intent: profile.membership_intent ?? null,
    verified_at: profile.verified_at ?? null,
    membership_status: profile.membership_status ?? null,
  }
}

export default async function MembersPage() {
  const viewer = await getViewer()

  if (!viewer) {
    return null
  }

  const profile = viewer.profile
  const isAdmin = viewer.role === 'admin'
  const showPending =
    viewer.membershipStatus === 'applicant' ||
    viewer.membershipStatus === 'pending'

  const { members: directoryMembers, error: directoryError } =
    await loadDirectoryProfiles(viewer.userId, isAdmin)

  const currentMember = profile
    ? toDirectoryMember(profile, viewer.email)
    : null

  const canBrowseDiscovery =
    viewer.membershipStatus === 'approved' ||
    isAdmin ||
    viewer.role === 'host'

  return (
    <>
      <PageHeader
        eyebrow="Discovery"
        title="Members"
        description="A curated directory for verified connections—intent and trust first, not a public social graph."
        actions={
          <Badge
            variant={viewer.membershipStatus === 'approved' ? 'success' : 'warning'}
          >
            {membershipStatusLabel(viewer.membershipStatus)}
          </Badge>
        }
      />

      {showPending ? (
        <Card className="mb-6 border-warning/30 bg-warning-soft/40" padding="sm">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Your application is on file. Complete your profile so the membership
            team can verify you for full discovery access.
          </p>
        </Card>
      ) : null}

      <section className="mb-10">
        <h2 className="text-display mb-4 text-xl font-medium text-foreground">
          Your profile
        </h2>
        {currentMember ? (
          <MemberProfileCard
            member={currentMember}
            isCurrentUser
            href={`/members/${viewer.userId}`}
          />
        ) : (
          <EmptyState
            title="Profile not found"
            description="Save your profile below to create your member record."
          />
        )}
      </section>

      <section className="mb-10">
        <ProfileForm
          userId={viewer.userId}
          email={profile?.email ?? viewer.email}
          fullName={profile?.full_name ?? null}
          membershipIntent={profile?.membership_intent ?? null}
        />
      </section>

      {viewer.role === 'admin' ? (
        <Card className="mb-10" padding="sm">
          <h2 className="text-display text-lg font-medium text-foreground">
            Administrator
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage member roles and review the roster.
          </p>
          <Link
            href="/admin/users"
            className="mt-4 inline-block text-sm font-medium text-accent underline"
          >
            Manage users →
          </Link>
        </Card>
      ) : null}

      <section>
        <h2 className="text-display mb-2 text-xl font-medium text-foreground">
          {isAdmin ? 'Member directory' : 'Community'}
        </h2>
        <p className="mb-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {isAdmin
            ? 'Search and filter the verified roster. Contact details and intent are visible to administrators only.'
            : 'Meet members through club events. Full directory browsing is limited while we expand privacy-safe discovery policies.'}
        </p>

        {directoryError ? (
          <p className="text-sm text-danger">
            Could not load directory: {directoryError}
          </p>
        ) : isAdmin && canBrowseDiscovery ? (
          <MemberDiscoveryGrid members={directoryMembers} limited={false} />
        ) : canBrowseDiscovery ? (
          <EmptyState
            title="Directory opens for administrators"
            description="You can still build trust at events and keep your profile current. Hosts and admins may share introductions when appropriate."
            action={
              <Link
                href="/events"
                className="text-sm font-medium text-accent underline"
              >
                Browse events
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="Discovery unlocks after approval"
            description="Once verified, you can participate in the full member experience and event calendar."
            action={
              <Link
                href="/members"
                className="text-sm font-medium text-accent underline"
              >
                Complete your profile
              </Link>
            }
          />
        )}
      </section>
    </>
  )
}
