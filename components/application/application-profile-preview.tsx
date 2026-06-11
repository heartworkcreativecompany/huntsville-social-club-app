'use client'

import { useMemo } from 'react'
import type { ApplicationDraft, ApplicationStatus } from '@/lib/application'
import ApplicationProfilePhotoPreview from './application-profile-photo-preview'

export default function ApplicationProfilePreview({
  draft,
  userId,
  email,
  applicationStatus,
  variant = 'inline',
}: {
  draft: ApplicationDraft
  userId: string
  email?: string | null
  applicationStatus: ApplicationStatus
  variant?: 'inline' | 'submitted'
}) {
  const isLive = applicationStatus === 'approved'

  const banner = useMemo(
    () =>
      isLive ? (
        <span>This is how your profile appears to other members.</span>
      ) : (
        <span>
          <strong className="font-medium text-foreground">Preview only.</strong>{' '}
          Your profile stays private until membership is approved. This matches the
          layout other members will see in the directory.
        </span>
      ),
    [isLive]
  )

  return (
    <div
      className={
        variant === 'submitted'
          ? 'rounded-xl border border-border bg-background/50 p-4 sm:p-6'
          : 'rounded-lg border border-border bg-background/30 p-4'
      }
    >
      <div className="mb-4">
        <h3 className="text-display text-base font-medium text-foreground">
          Profile preview
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Review your public name, about text, details, and photos before you
          submit.
        </p>
      </div>

      <div className="mb-4 rounded-lg border border-accent/30 bg-accent-soft/40 px-4 py-3 text-sm text-muted-foreground">
        {banner}
      </div>

      <ApplicationProfilePhotoPreview
        draft={draft}
        userId={userId}
        email={email}
        applicationStatus={applicationStatus}
      />
    </div>
  )
}
