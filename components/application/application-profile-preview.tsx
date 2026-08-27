'use client'

import type { ApplicationDraft, ApplicationStatus } from '@/lib/application'
import { APPLICATION_REVIEW_PREVIEW_NOTICE } from '@/lib/application-form-content'
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

  return (
    <div
      className={
        variant === 'submitted'
          ? 'rounded-xl border border-border bg-background/50 p-4 sm:p-6'
          : 'rounded-lg border border-border bg-background/30 p-4'
      }
    >
      <div className="mb-4 min-w-0 rounded-lg border border-accent/30 bg-accent-soft/40 px-4 py-3 text-sm leading-relaxed break-words text-muted-foreground">
        {isLive
          ? 'This is how your profile appears to other members.'
          : APPLICATION_REVIEW_PREVIEW_NOTICE}
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
