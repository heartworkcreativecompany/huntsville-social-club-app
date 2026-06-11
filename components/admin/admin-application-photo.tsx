'use client'

import MemberPhotoDisplay from '@/components/members/member-photo-display'
import type { ApplicationPhoto } from '@/lib/application'

export default function AdminApplicationPhoto({
  applicantId,
  photo,
  size = 'thumbnail',
  className = '',
}: {
  applicantId: string
  photo: ApplicationPhoto | null
  size?: 'thumbnail' | 'large'
  className?: string
}) {
  return (
    <MemberPhotoDisplay
      memberId={applicantId}
      photo={photo}
      size={size === 'large' ? 'large' : 'thumbnail'}
      className={className}
      showPrimaryBadge={photo?.isPrimary}
    />
  )
}
