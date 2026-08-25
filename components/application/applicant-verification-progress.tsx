'use client'

import { useState, useTransition } from 'react'
import Badge from '@/components/ui/badge'
import Card from '@/components/ui/card'
import ProfilePhoneVerificationCard from '@/components/profile/profile-phone-verification-card'
import ResendConfirmationEmail from '@/components/auth/resend-confirmation-email'
import {
  APPLICANT_VERIFICATION_GATES,
  applicantVerificationGateTitle,
  applicantVerificationRowState,
  identityVerificationRowState,
  type ApprovalGates,
  type ApprovalGateKey,
} from '@/lib/membership-systems'
import { buttonPrimaryClassName, buttonSecondaryClassName, mobileFullButtonClassName } from '@/lib/event-labels'
import { useRouter } from 'next/navigation'

function identityCtaLabel(cta: 'start' | 'continue' | 'retry'): string {
  switch (cta) {
    case 'retry':
      return 'Retry verification'
    case 'continue':
      return 'Continue verification'
    default:
      return 'Start verification'
  }
}

/**
 * Member-facing verification list on Application status.
 * Email: Supabase Auth confirmation. Phone: Supabase Auth SMS (SMS provider
 * configured in Supabase, e.g. Twilio). Identity: Stripe Identity sessions + webhooks.
 */
export default function ApplicantVerificationProgress({
  gates,
  email,
  emailConfirmed,
  identityVerificationStatus,
  identityVerifiedAt,
  identityVerificationLastError,
  verifiedPhoneE164,
  authPhoneE164,
  showIdentityReturnNotice = false,
}: {
  gates: ApprovalGates
  email?: string | null
  emailConfirmed: boolean
  identityVerificationStatus?: string | null
  identityVerifiedAt?: string | null
  identityVerificationLastError?: string | null
  verifiedPhoneE164?: string | null
  authPhoneE164?: string | null
  showIdentityReturnNotice?: boolean
}) {
  const router = useRouter()
  const [phoneOpen, setPhoneOpen] = useState(false)
  const [identityError, setIdentityError] = useState('')
  const [isPending, startTransition] = useTransition()

  const phoneVerified = gates.phone_verified === 'approved'
  const identityRow = identityVerificationRowState(
    identityVerificationStatus,
    gates.identity_verified ?? 'incomplete'
  )

  const startIdentity = () => {
    setIdentityError('')
    startTransition(async () => {
      const response = await fetch('/api/stripe/identity/session', {
        method: 'POST',
      })
      const payload = (await response.json().catch(() => ({}))) as {
        url?: string
        error?: string
      }

      if (!response.ok || !payload.url) {
        setIdentityError(
          payload.error ?? 'Could not start identity verification.'
        )
        return
      }

      window.location.href = payload.url
    })
  }

  return (
    <Card>
      <h3 className="text-display text-lg font-semibold text-foreground">
        Verification progress
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Complete any member steps below. Photo and application review are handled
        by the membership team.
      </p>

      {showIdentityReturnNotice && !identityRow.approved ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Thanks — if verification is still processing, this page will update when
          Stripe finishes. You can refresh in a moment.
        </p>
      ) : null}

      <ul className="mt-4 grid gap-3">
        {APPLICANT_VERIFICATION_GATES.map((gate) => {
          const rawStatus = gates[gate.key] ?? 'incomplete'
          // Supabase Auth email_confirmed_at is the source of truth for this row.
          const status =
            gate.key === 'email_verified' && emailConfirmed
              ? 'approved'
              : rawStatus

          const isIdentity = gate.key === 'identity_verified'
          const row = isIdentity
            ? {
                label: identityRow.label,
                tone: identityRow.tone,
              }
            : applicantVerificationRowState(gate.key, status)
          const title = applicantVerificationGateTitle(gate.key, status)
          const approved = isIdentity ? identityRow.approved : status === 'approved'

          return (
            <li
              key={gate.key}
              className="rounded-lg border border-border bg-surface-elevated px-3 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {verificationRowTitle(gate.key, title)}
                  </p>
                  {gateDescription(gate.key) ? (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {gateDescription(gate.key)}
                    </p>
                  ) : null}
                </div>
                <Badge
                  variant={
                    row.tone === 'success'
                      ? 'success'
                      : row.tone === 'danger'
                        ? 'danger'
                        : row.tone === 'warning'
                          ? 'warning'
                          : 'muted'
                  }
                >
                  {row.label}
                </Badge>
              </div>

              {gate.key === 'email_verified' && !approved && email ? (
                <div className="mt-3">
                  <ResendConfirmationEmail email={email} />
                </div>
              ) : null}

              {gate.key === 'phone_verified' && !approved ? (
                <div className="mt-3 grid gap-3">
                  {!phoneOpen ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <button
                        type="button"
                        className={`${buttonPrimaryClassName} ${mobileFullButtonClassName}`}
                        onClick={() => setPhoneOpen(true)}
                      >
                        {status === 'pending_review'
                          ? 'Continue phone verification'
                          : 'Start phone verification'}
                      </button>
                    </div>
                  ) : (
                    <ProfilePhoneVerificationCard
                      verifiedPhoneE164={verifiedPhoneE164 ?? null}
                      phoneVerified={phoneVerified}
                      authPhoneE164={authPhoneE164 ?? null}
                      embedded
                    />
                  )}
                </div>
              ) : null}

              {isIdentity && !approved && identityRow.cta ? (
                <div className="mt-3 grid gap-2">
                  {identityVerificationStatus === 'requires_input' &&
                  identityVerificationLastError ? (
                    <p className="min-w-0 text-sm break-words text-danger">
                      {identityVerificationLastError}
                    </p>
                  ) : null}
                  {identityError ? (
                    <p className="min-w-0 text-sm break-words text-danger">{identityError}</p>
                  ) : null}
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <button
                      type="button"
                      className={`${buttonPrimaryClassName} ${mobileFullButtonClassName}`}
                      disabled={isPending}
                      onClick={startIdentity}
                    >
                      {isPending
                        ? 'Starting…'
                        : identityCtaLabel(identityRow.cta)}
                    </button>
                    <button
                      type="button"
                      className={`${buttonSecondaryClassName} ${mobileFullButtonClassName}`}
                      disabled={isPending}
                      onClick={() => router.refresh()}
                    >
                      Refresh status
                    </button>
                  </div>
                </div>
              ) : null}

              {isIdentity && approved && identityVerifiedAt ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Verified {new Date(identityVerifiedAt).toLocaleString()}
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function verificationRowTitle(
  key: ApprovalGateKey,
  fallback: string
): string {
  switch (key) {
    case 'email_verified':
      return 'Email Verification'
    case 'phone_verified':
      return 'Phone Verification'
    default:
      return fallback
  }
}

function gateDescription(key: ApprovalGateKey): string {
  switch (key) {
    case 'email_verified':
      return ''
    case 'phone_verified':
      // Underlying flow: Supabase Auth phone_change SMS (provider set in Supabase).
      return 'Verify your mobile number with a text code.'
    case 'photos_reviewed':
      return 'Membership team reviews your photos.'
    case 'application_reviewed':
      return 'Membership team reviews your application.'
    case 'identity_verified':
      return 'Required. Government ID and matching selfie.'
    default:
      return ''
  }
}
