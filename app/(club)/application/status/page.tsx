import Link from 'next/link'
import { redirect } from 'next/navigation'
import ApplicationStatusPanel from '@/components/application/application-status-panel'
import PageHeader from '@/components/ui/page-header'
import { syncEmailApprovalGateForUser } from '@/lib/approval-gate-sync'
import { parseApprovalGates } from '@/lib/membership-systems'
import { createClient } from '@/lib/supabase/server'
import { getViewer } from '@/lib/viewer'

type PageProps = {
  searchParams: Promise<{ submitted?: string; identity?: string }>
}

export default async function ApplicationStatusPage({
  searchParams,
}: PageProps) {
  const viewer = await getViewer()
  const params = await searchParams

  if (!viewer) {
    redirect('/login')
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const emailConfirmed = Boolean(user?.email_confirmed_at)
  if (emailConfirmed) {
    await syncEmailApprovalGateForUser(supabase, viewer.userId, true)
  }

  const profile = viewer.profile
  const status = viewer.applicationStatus
  const gates = parseApprovalGates(profile?.approval_gates)
  if (emailConfirmed) {
    gates.email_verified = 'approved'
  }

  const showSubmitBanner = params.submitted === '1'
  const showIdentityReturnNotice = params.identity === 'return'

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
        description="Track where you are in the membership process and complete any remaining verification steps."
      />

      <ApplicationStatusPanel
        status={status}
        submittedAt={profile?.application_submitted_at}
        verifiedAt={profile?.verified_at}
        adminNotes={profile?.admin_review_notes}
        approvalGates={gates}
        email={viewer.email}
        emailConfirmed={emailConfirmed}
        identityVerificationStatus={profile?.identity_verification_status}
        identityVerifiedAt={profile?.identity_verified_at}
        identityVerificationLastError={
          profile?.identity_verification_last_error
        }
        verifiedPhoneE164={profile?.verified_phone_e164}
        authPhoneE164={user?.phone ?? null}
        showSubmitBanner={showSubmitBanner}
        showIdentityReturnNotice={showIdentityReturnNotice}
      />
    </>
  )
}
