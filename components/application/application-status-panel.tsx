import Link from 'next/link'
import ApplicationStatusBadge from '@/components/application/application-status-badge'
import Card from '@/components/ui/card'
import IdentityVerificationCard from '@/components/application/identity-verification-card'
import {
  applicationStatusLabel,
  nextActionForApplicant,
  type ApplicationStatus,
} from '@/lib/application'
import { buttonPrimaryClassName, buttonSecondaryClassName } from '@/lib/event-labels'
import {
  applicantGateSummary,
  type ApprovalGates,
} from '@/lib/membership-systems'
import type { IdentityVerificationStatus } from '@/lib/stripe/identity'
import { VerificationGateChecklistCard } from '@/components/profile/verification-gate-checklist'

const STATUS_STEPS: {
  status: ApplicationStatus
  label: string
  description: string
}[] = [
  {
    status: 'draft',
    label: 'Draft',
    description: 'Save progress and complete your intake.',
  },
  {
    status: 'submitted',
    label: 'Submitted',
    description: 'Your application is in the queue for review.',
  },
  {
    status: 'in_review',
    label: 'Under review',
    description: 'The membership team is reviewing your profile.',
  },
  {
    status: 'approved',
    label: 'Approved',
    description: 'Full member access is active.',
  },
]

function stepIndex(status: ApplicationStatus): number {
  if (status === 'needs_info' || status === 'rejected') return 1
  const idx = STATUS_STEPS.findIndex((s) => s.status === status)
  return idx >= 0 ? idx : 0
}

function parseIdentityStatus(
  value: string | null | undefined
): IdentityVerificationStatus {
  switch (value) {
    case 'pending':
    case 'processing':
    case 'verified':
    case 'requires_input':
    case 'canceled':
    case 'not_started':
      return value
    default:
      return 'not_started'
  }
}

export default function ApplicationStatusPanel({
  status,
  submittedAt,
  verifiedAt,
  adminNotes,
  approvalGates,
  identityVerificationStatus,
  identityVerifiedAt,
  identityVerificationLastError,
  showSubmitBanner = false,
  showIdentityReturnNotice = false,
}: {
  status: ApplicationStatus
  submittedAt?: string | null
  verifiedAt?: string | null
  adminNotes?: string | null
  approvalGates?: ApprovalGates
  identityVerificationStatus?: string | null
  identityVerifiedAt?: string | null
  identityVerificationLastError?: string | null
  showSubmitBanner?: boolean
  showIdentityReturnNotice?: boolean
}) {
  const next = nextActionForApplicant(status)
  const currentIdx = stepIndex(status)
  const isException = status === 'needs_info' || status === 'rejected'
  const gateSummary = approvalGates
    ? applicantGateSummary(approvalGates)
    : null
  const showIdentityCard =
    status === 'submitted' ||
    status === 'in_review' ||
    status === 'needs_info' ||
    status === 'approved'

  return (
    <div className="grid gap-6">
      {showSubmitBanner ? (
        <Card className="border-success/30 bg-success-soft/40">
          <h2 className="text-display text-lg font-semibold">
            Application submitted
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Thank you — the membership team has your application. Review
            typically takes a few days. Track status here anytime.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            What happens next: complete identity verification below, then your
            application continues through review on this page.
          </p>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-display text-xl font-medium text-foreground">
            Application status
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {applicationStatusLabel(status)}
          </p>
        </div>
        <ApplicationStatusBadge status={status} />
      </div>

      {isException ? (
        <Card
          className={
            status === 'rejected'
              ? 'border-danger/30 bg-danger-soft/30'
              : 'border-warning/30 bg-warning-soft/40'
          }
          padding="sm"
        >
          <h3 className="text-display text-base font-medium text-foreground">
            {status === 'rejected'
              ? 'Application not approved'
              : 'More information needed'}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {next.description}
          </p>
          {adminNotes ? (
            <p className="mt-3 text-sm text-foreground">
              <span className="font-medium">Reviewer notes: </span>
              {adminNotes}
            </p>
          ) : null}
          {status === 'needs_info' || status === 'rejected' ? (
            <Link href={next.href} className={`${buttonPrimaryClassName} mt-4`}>
              {next.cta}
            </Link>
          ) : null}
        </Card>
      ) : (
        <Card>
          <ol className="grid gap-4 sm:grid-cols-4">
            {STATUS_STEPS.map((step, idx) => {
              const done = idx < currentIdx
              const active = idx === currentIdx
              return (
                <li
                  key={step.status}
                  className={`rounded-lg border px-3 py-3 text-sm ${
                    active
                      ? 'border-accent bg-accent-soft/50'
                      : done
                        ? 'border-success/30 bg-success-soft/20'
                        : 'border-border bg-background/50'
                  }`}
                >
                  <p className="font-medium text-foreground">{step.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </li>
              )
            })}
          </ol>
        </Card>
      )}

      {showIdentityCard ? (
        <IdentityVerificationCard
          status={parseIdentityStatus(identityVerificationStatus)}
          lastError={identityVerificationLastError}
          verifiedAt={identityVerifiedAt}
          showReturnNotice={showIdentityReturnNotice}
        />
      ) : null}

      {gateSummary && status !== 'approved' && status !== 'draft' ? (
        <VerificationGateChecklistCard
          title="Verification progress"
          description={gateSummary.label}
          gates={approvalGates ?? {}}
        />
      ) : null}

      <Card>
        <h3 className="text-display text-lg font-semibold">
          {next.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {next.description}
        </p>
        <dl className="mt-4 grid gap-3 text-sm">
          {submittedAt ? (
            <div>
              <dt className="text-muted-foreground">Submitted</dt>
              <dd className="font-medium text-foreground">
                {new Date(submittedAt).toLocaleString()}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-muted-foreground">Membership approved</dt>
            <dd className="font-medium text-foreground">
              {verifiedAt
                ? new Date(verifiedAt).toLocaleString()
                : 'Pending approval'}
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          {(status === 'draft' || status === 'needs_info' || status === 'rejected') && (
            <Link href={next.href} className={buttonPrimaryClassName}>
              {next.cta}
            </Link>
          )}
          {status === 'approved' ? (
            <Link href="/home" className={buttonPrimaryClassName}>
              Go to member home
            </Link>
          ) : null}
          {status === 'submitted' || status === 'in_review' ? (
            <Link href="/application" className={buttonSecondaryClassName}>
              View application
            </Link>
          ) : null}
        </div>
      </Card>
    </div>
  )
}
