import Link from 'next/link'
import ApplicantVerificationProgress from '@/components/application/applicant-verification-progress'
import Card from '@/components/ui/card'
import {
  nextActionForApplicant,
  type ApplicationStatus,
} from '@/lib/application'
import { buttonPrimaryClassName, buttonSecondaryClassName } from '@/lib/event-labels'
import { type ApprovalGates } from '@/lib/membership-systems'

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

export default function ApplicationStatusPanel({
  status,
  submittedAt,
  verifiedAt,
  adminNotes,
  approvalGates,
  email,
  emailConfirmed = false,
  identityVerificationStatus,
  identityVerifiedAt,
  identityVerificationLastError,
  verifiedPhoneE164,
  authPhoneE164,
  showSubmitBanner = false,
  showIdentityReturnNotice = false,
}: {
  status: ApplicationStatus
  submittedAt?: string | null
  verifiedAt?: string | null
  adminNotes?: string | null
  approvalGates?: ApprovalGates
  email?: string | null
  emailConfirmed?: boolean
  identityVerificationStatus?: string | null
  identityVerifiedAt?: string | null
  identityVerificationLastError?: string | null
  verifiedPhoneE164?: string | null
  authPhoneE164?: string | null
  showSubmitBanner?: boolean
  showIdentityReturnNotice?: boolean
}) {
  const next = nextActionForApplicant(status)
  const currentIdx = stepIndex(status)
  const isException = status === 'needs_info' || status === 'rejected'
  const showVerification =
    Boolean(approvalGates) && status !== 'approved' && status !== 'draft'
  // Stepper cards already show Draft/Submitted/etc. — avoid repeating that title below.
  const showQuietDetails =
    status === 'submitted' || status === 'in_review' || status === 'approved'

  return (
    <div className="grid gap-6">
      {showSubmitBanner ? (
        <Card className="border-success/30 bg-success-soft/40">
          <h2 className="text-display text-lg font-semibold">
            Application submitted
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Thank you — the membership team has your application. Use the steps
            below for status and verification.
          </p>
        </Card>
      ) : null}

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

      {showVerification && approvalGates ? (
        <ApplicantVerificationProgress
          gates={approvalGates}
          email={email}
          emailConfirmed={emailConfirmed}
          identityVerificationStatus={identityVerificationStatus}
          identityVerifiedAt={identityVerifiedAt}
          identityVerificationLastError={identityVerificationLastError}
          verifiedPhoneE164={verifiedPhoneE164}
          authPhoneE164={authPhoneE164}
          showIdentityReturnNotice={showIdentityReturnNotice}
        />
      ) : null}

      <Card>
        {showQuietDetails ? (
          <>
            <h3 className="text-display text-lg font-semibold">Details</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {status === 'approved'
                ? 'Your membership is active.'
                : 'Complete any open verification steps above while the membership team reviews your application.'}
            </p>
          </>
        ) : (
          <>
            <h3 className="text-display text-lg font-semibold">{next.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {next.description}
            </p>
          </>
        )}
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
          {(status === 'draft' ||
            status === 'needs_info' ||
            status === 'rejected') && (
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
