'use client'

import type { ApplicationPhoto } from '@/lib/application'
import { primaryMemberPhoto } from '@/lib/member-photos'
import {
  MemberProfileGalleryBlock,
  useMemberPhotoSelection,
} from '@/components/members/member-photo-gallery'

export default function MemberProfileDetailLayout({
  memberId,
  photos,
  banner,
  details,
  footer,
}: {
  memberId: string
  photos: ApplicationPhoto[]
  banner?: React.ReactNode
  details: React.ReactNode
  footer?: React.ReactNode
}) {
  const { selected, selectedId, setSelectedId } = useMemberPhotoSelection(photos)
  const activePhoto = selected ?? primaryMemberPhoto(photos)

  return (
    <div className="grid gap-6">
      {banner ? (
        <div className="rounded-lg border border-accent/30 bg-accent-soft/40 px-4 py-3 text-sm text-muted-foreground">
          {banner}
        </div>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-8">
        <MemberProfileGalleryBlock
          memberId={memberId}
          photos={photos}
          selected={activePhoto}
          selectedId={selectedId}
          onSelect={setSelectedId}
          thumbnailsVariant="scroll"
        />
        <div className="min-w-0">{details}</div>
      </div>

      {footer ? <div>{footer}</div> : null}
    </div>
  )
}
