import Link from 'next/link'
import { redirect } from 'next/navigation'
import EmptyState from '@/components/ui/empty-state'
import MemberProfileCard from '@/components/members/member-profile-card'
import { loadMemberProfile } from '@/lib/load-directory-profiles'
import { getViewer } from '@/lib/viewer'

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function MemberDetailPage({ params }: PageProps) {
  const { id } = await params
  const viewer = await getViewer()

  if (!viewer) {
    redirect('/login')
  }

  const isAdmin = viewer.role === 'admin'
  const isSelf = id === viewer.userId
  const { member, error } = await loadMemberProfile(id, viewer.userId, isAdmin)

  if (!isAdmin && !isSelf) {
    return (
      <>
        <Link
          href="/members"
          className="mb-6 inline-block text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to members
        </Link>
        <EmptyState
          title="Profile not available"
          description="Member details are shared selectively. Connect at club events or ask an administrator for an introduction."
          action={
            <Link
              href="/events"
              className="text-sm font-medium text-accent underline"
            >
              View events
            </Link>
          }
        />
      </>
    )
  }

  if (error || !member) {
    return (
      <>
        <Link
          href="/members"
          className="mb-6 inline-block text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to members
        </Link>
        <EmptyState
          title="Member not found"
          description={
            error ??
            'This profile may be private or no longer available.'
          }
        />
      </>
    )
  }

  return (
    <>
      <Link
        href="/members"
        className="mb-6 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to members
      </Link>

      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        Member profile
      </p>
      <h1 className="text-display mt-2 mb-8 text-3xl font-medium text-foreground sm:text-4xl">
        {isSelf ? 'Your profile' : 'Member detail'}
      </h1>

      <MemberProfileCard
        member={member}
        isCurrentUser={isSelf}
        limited={!isAdmin}
      />

      {isSelf ? (
        <p className="mt-6 text-sm text-muted-foreground">
          <Link href="/members" className="font-medium text-accent underline">
            Edit profile settings
          </Link>{' '}
          on the members page.
        </p>
      ) : null}
    </>
  )
}
