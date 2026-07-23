'use client'

import MemberProfileDetailLayout from '@/components/members/member-profile-detail-layout'
import type { ApplicationDraft, ApplicationStatus } from '@/lib/application'
import {
  directoryMemberFromApplicationDraft,
  publicProfileDetailsFromDraft,
} from '@/lib/application-profile-preview'
import MemberProfileDetailsPanel from '@/components/members/member-profile-details-panel'
import MemberPublicDetails from '@/components/members/member-public-details'
import { useMemo } from 'react'

/** Applicant preview — same layout as member profile detail. */
export default function ApplicationProfilePhotoPreview({
  draft,
  userId,
  email,
  applicationStatus,
}: {
  draft: ApplicationDraft
  userId: string
  email?: string | null
  applicationStatus: ApplicationStatus
}) {
  const member = useMemo(
    () =>
      directoryMemberFromApplicationDraft(draft, {
        userId,
        email,
        applicationStatus,
      }),
    [draft, userId, email, applicationStatus]
  )

  const details = useMemo(() => publicProfileDetailsFromDraft(draft), [draft])

  return (
    <MemberProfileDetailLayout
      memberId={userId}
      photos={draft.photos}
      details={
        <div className="grid gap-4">
          <MemberProfileDetailsPanel
            member={member}
            limited
            previewMode
          />
          <MemberPublicDetails details={details} compact />
        </div>
      }
    />
  )
}
