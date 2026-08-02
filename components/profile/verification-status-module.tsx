import Card from '@/components/ui/card'
import ApplicationStatusBadge from '@/components/application/application-status-badge'
import { MemberProfileBadges } from '@/components/members/member-badge-row'
import type { ApplicationStatus } from '@/lib/application'
import type { DirectoryMember } from '@/lib/members-discovery'
import { parseApprovalGates } from '@/lib/membership-systems'
import VerificationGateChecklist from '@/components/profile/verification-gate-checklist'

export default function VerificationStatusModule({
  applicationStatus,
  member,
  approvalGatesRaw,
}: {
  applicationStatus: ApplicationStatus
  member: DirectoryMember
  approvalGatesRaw: unknown
}) {
  const gates = parseApprovalGates(approvalGatesRaw)
  const isApproved = applicationStatus === 'approved'

  return (
    <Card>
      <p className="eyebrow">Account status</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ApplicationStatusBadge status={applicationStatus} />
        <MemberProfileBadges member={member} />
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        {isApproved
          ? 'Your membership is approved. Keep contact details and verification steps up to date so staff can reach you when needed.'
          : 'Complete the steps below so staff can review your membership application.'}
      </p>

      <div className="mt-4">
        <VerificationGateChecklist
          gates={gates}
          requiredOnly={isApproved}
          hideSectionLabels={isApproved}
        />
      </div>
    </Card>
  )
}
