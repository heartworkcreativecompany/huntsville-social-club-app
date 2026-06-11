'use client'

import type { ApplicationPhoto } from '@/lib/application'
import { primaryMemberPhoto } from '@/lib/member-photos'
import {
  MemberProfileGalleryBlock,
  MemberProfilePrimaryPhoto,
  ProfileThumbnailStrip,
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

      {/* Mobile: gallery block (image + thumbs) then details */}
      <div className="grid gap-6 lg:hidden">
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

      {/* Desktop: two-column row, thumbnails below */}
      <div className="hidden lg:grid lg:gap-8">
        <div className="grid grid-cols-[17rem_minmax(0,1fr)] items-start gap-8">
          <MemberProfilePrimaryPhoto
            memberId={memberId}
            photo={activePhoto}
          />
          <div className="min-w-0">{details}</div>
        </div>

        {photos.length > 1 ? (
          <div className="border-t border-border pt-4">
            <ProfileThumbnailStrip
              memberId={memberId}
              photos={photos}
              selectedId={selectedId}
              onSelect={setSelectedId}
              variant="wrap"
            />
          </div>
        ) : null}
      </div>

      {footer ? <div>{footer}</div> : null}
    </div>
  )
}
