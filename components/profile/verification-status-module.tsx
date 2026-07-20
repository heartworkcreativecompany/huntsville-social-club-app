import Card from '@/components/ui/card'
import ApplicationStatusBadge from '@/components/application/application-status-badge'
import { MemberProfileBadges } from '@/components/members/member-badge-row'
import type { ApplicationStatus } from '@/lib/application'
import type { DirectoryMember } from '@/lib/members-discovery'
import {
  PUBLIC_VERIFIED_BADGE_SUMMARY,
  parseApprovalGates,
} from '@/lib/membership-systems'
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

  return (
    <Card>
      <p className="eyebrow">Verification</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ApplicationStatusBadge status={applicationStatus} />
        <MemberProfileBadges member={member} />
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        {PUBLIC_VERIFIED_BADGE_SUMMARY} Other members see a single Verified badge
        when all requirements are complete.
      </p>

      <div className="mt-4">
        <VerificationGateChecklist gates={gates} />
      </div>
    </Card>
  )
}
