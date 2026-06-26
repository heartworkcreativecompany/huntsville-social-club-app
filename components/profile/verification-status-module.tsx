import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import ApplicationStatusBadge from '@/components/application/application-status-badge'
import { MemberProfileBadges } from '@/components/members/member-badge-row'
import type { ApplicationStatus } from '@/lib/application'
import type { DirectoryMember } from '@/lib/members-discovery'
import { APPROVAL_GATE_DEFS, parseApprovalGates } from '@/lib/membership-systems'

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

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {APPROVAL_GATE_DEFS.map((gate) => {
          const status = gates[gate.key] ?? 'incomplete'
          const approved = status === 'approved'
          return (
            <li
              key={gate.key}
              className="flex items-center justify-between rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm"
            >
              <span className="text-muted-foreground">{gate.label}</span>
              <Badge variant={approved ? 'success' : 'muted'}>
                {approved ? 'Done' : 'Pending'}
              </Badge>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
