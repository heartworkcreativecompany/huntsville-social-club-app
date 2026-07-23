'use client'

import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import {
  OPTIONAL_APPROVAL_GATES,
  REQUIRED_APPROVAL_GATES,
  approvalGateApplicantStatus,
  type ApprovalGateDef,
  type ApprovalGateKey,
  type ReviewStatus,
} from '@/lib/membership-systems'

function GateChecklist({
  gates,
  gateKeys,
  showRequiredLabel,
}: {
  gates: Partial<Record<ApprovalGateKey, ReviewStatus>>
  gateKeys: ApprovalGateDef[]
  showRequiredLabel?: boolean
}) {
  return (
    <ul className="grid gap-2">
      {gateKeys.map((gate) => {
        const status = gates[gate.key] ?? 'incomplete'
        const approved = status === 'approved'
        return (
          <li
            key={gate.key}
            className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <span className="text-foreground">{gate.label}</span>
              {showRequiredLabel ? (
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {gate.requiredForApproval ? 'Required' : 'Optional'}
                  {!gate.implemented ? ' · Coming soon' : ''}
                </span>
              ) : null}
            </div>
            <Badge variant={approved ? 'success' : gate.implemented ? 'warning' : 'muted'}>
              {approvalGateApplicantStatus(gate.key, status)}
            </Badge>
          </li>
        )
      })}
    </ul>
  )
}

export default function VerificationGateChecklist({
  gates,
  showRequiredLabels = false,
  /** Application status should not surface optional phone OTP as a blocker. */
  requiredOnly = false,
}: {
  gates: Partial<Record<ApprovalGateKey, ReviewStatus>>
  showRequiredLabels?: boolean
  requiredOnly?: boolean
}) {
  return (
    <div className="grid gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Required for membership approval
        </p>
        <div className="mt-2">
          <GateChecklist
            gates={gates}
            gateKeys={REQUIRED_APPROVAL_GATES}
            showRequiredLabel={showRequiredLabels}
          />
        </div>
      </div>
      {!requiredOnly && OPTIONAL_APPROVAL_GATES.length > 0 ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Optional
          </p>
          <div className="mt-2">
            <GateChecklist
              gates={gates}
              gateKeys={OPTIONAL_APPROVAL_GATES}
              showRequiredLabel={showRequiredLabels}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function VerificationGateChecklistCard({
  title,
  description,
  gates,
  requiredOnly = false,
}: {
  title: string
  description?: string
  gates: Partial<Record<ApprovalGateKey, ReviewStatus>>
  requiredOnly?: boolean
}) {
  return (
    <Card padding="sm">
      <h3 className="text-display text-base font-medium text-foreground">{title}</h3>
      {description ? (
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      ) : null}
      <div className="mt-3">
        <VerificationGateChecklist gates={gates} requiredOnly={requiredOnly} />
      </div>
    </Card>
  )
}
