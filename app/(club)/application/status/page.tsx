import Link from 'next/link'
import { redirect } from 'next/navigation'
import ApplicationStatusPanel from '@/components/application/application-status-panel'
import PageHeader from '@/components/ui/page-header'
import ApplicationStatusBadge from '@/components/application/application-status-badge'
import { parseApprovalGates } from '@/lib/membership-systems'
import { getViewer } from '@/lib/viewer'

type PageProps = {
  searchParams: Promise<{ submitted?: string }>
}

export default async function ApplicationStatusPage({
  searchParams,
}: PageProps) {
  const viewer = await getViewer()
  const params = await searchParams

  if (!viewer) {
    redirect('/login')
  }

  const profile = viewer.profile
  const status = viewer.applicationStatus
  const showSubmitBanner = params.submitted === '1'

  return (
    <>
      <Link
        href="/application"
        className="mb-6 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to application
      </Link>

      <PageHeader
        eyebrow="Membership"
        title="Application status"
        description="Track where you are in the membership process and what to do next."
        actions={<ApplicationStatusBadge status={status} />}
      />

      <ApplicationStatusPanel
        status={status}
        submittedAt={profile?.application_submitted_at}
        verifiedAt={profile?.verified_at}
        adminNotes={profile?.admin_review_notes}
        approvalGates={parseApprovalGates(profile?.approval_gates)}
        showSubmitBanner={showSubmitBanner}
      />
    </>
  )
}
