import Link from 'next/link'
import Badge from '@/components/ui/badge'
import Card from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import PageHeader from '@/components/ui/page-header'
import MemberDiscoveryGrid from '@/components/members/member-discovery-grid'
import MemberProfileCard from '@/components/members/member-profile-card'
import { buildDirectoryMember, type DirectoryMember } from '@/lib/members-discovery'
import { loadDirectoryProfiles } from '@/lib/load-directory-profiles'
import { photosFromApplicationDraft } from '@/lib/member-photos'
import ApplicationStatusBadge from '@/components/application/application-status-badge'
import { getViewer, type ViewerProfile } from '@/lib/viewer'
import { mergeProfileIntoDraft } from '@/lib/application-draft-sync'
import MemberBillingStatus from '@/components/members/member-billing-status'
import ProfileForm from './profile-form'

function toDirectoryMember(profile: ViewerProfile, email: string): DirectoryMember {
  const member = buildDirectoryMember({
    ...profile,
    application_status: profile.application_status,
    email: profile.email ?? email,
  })
  member.photos = photosFromApplicationDraft(profile.application_draft)
  return member
}

export default async function MembersPage() {
  const viewer = await getViewer()

  if (!viewer) {
    return null
  }

  const profile = viewer.profile
  const isAdmin = viewer.role === 'admin'
  const canBrowseDiscovery = viewer.canAccessApp
  const { members: directoryMembers, error: directoryError } =
    await loadDirectoryProfiles(viewer.userId, canBrowseDiscovery, isAdmin)

  const currentMember = profile
    ? toDirectoryMember(profile, viewer.email)
    : null

  const draft = mergeProfileIntoDraft(profile)
  const canEditProfile = viewer.canAccessApp

  return (
    <>
      <PageHeader
        eyebrow="Discovery"
        title="Members"
        description="A curated directory for verified connections—intent and trust first, not a public social graph."
        actions={<ApplicationStatusBadge status={viewer.applicationStatus} />}
      />

      {!viewer.canAccessApp ? (
        <Card className="mb-6 border-warning/30 bg-warning-soft/40" padding="sm">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Discovery and member experiences unlock after approval. Continue your{' '}
            <Link href="/application" className="font-medium text-accent underline">
              membership application
            </Link>
            .
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

      {canEditProfile ? (
        <section className="mb-10">
          <MemberBillingStatus billingRaw={profile?.membership_billing} />
        </section>
      ) : null}

      {canEditProfile ? (
        <section className="mb-10">
          <ProfileForm
            displayName={
              draft.profile.displayName || profile?.full_name || ''
            }
            bio={draft.prompts.hopingToMeet || profile?.membership_intent || ''}
            locationArea={
              draft.location.neighborhoodOrArea || profile?.location_area || ''
            }
          />
        </section>
      ) : null}

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
            : canBrowseDiscovery
              ? 'Browse verified members who have completed membership approval. Contact details and intent are visible to administrators only.'
              : 'Discovery unlocks after your membership application is approved.'}
        </p>

        {directoryError ? (
          <p className="text-sm text-danger">
            Could not load directory: {directoryError}
          </p>
        ) : canBrowseDiscovery ? (
          <MemberDiscoveryGrid
            members={directoryMembers}
            limited={!isAdmin}
          />
        ) : (
          <EmptyState
            title="Membership approval required"
            description="Complete your application and receive approval to browse the verified member directory."
            action={
              <Link
                href="/application"
                className="text-sm font-medium text-accent underline"
              >
                Continue application
              </Link>
            }
          />
        )}
      </section>
    </>
  )
}
