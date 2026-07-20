'use client'

import { useState } from 'react'
import type { ApplicationPhoto } from '@/lib/application'
import { primaryMemberPhoto } from '@/lib/member-photos'
import MemberPhotoDisplay from './member-photo-display'

/** Shared primary image width — square, modest bump from 14rem. */
export const PROFILE_PRIMARY_IMAGE_CLASS =
  'mx-auto w-full max-w-[18rem] sm:max-w-[19rem] lg:mx-0 lg:max-w-[17rem]'

export function useMemberPhotoSelection(photos: ApplicationPhoto[]) {
  const [selectedId, setSelectedId] = useState<string | null>(
    primaryMemberPhoto(photos)?.id ?? null
  )

  const selected =
    photos.find((photo) => photo.id === selectedId) ??
    primaryMemberPhoto(photos)

  return { selected, selectedId, setSelectedId }
}

export function ProfileThumbnailStrip({
  memberId,
  photos,
  selectedId,
  onSelect,
  variant = 'scroll',
}: {
  memberId: string
  photos: ApplicationPhoto[]
  selectedId: string | null
  onSelect: (id: string) => void
  variant?: 'scroll' | 'wrap'
}) {
  if (photos.length <= 1) return null

  const listClass =
    variant === 'scroll'
      ? 'flex flex-nowrap gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
      : 'flex flex-wrap gap-2'

  return (
    <ul className={listClass}>
      {photos.map((photo) => (
        <li key={photo.id} className="w-14 shrink-0 sm:w-16">
          <button
            type="button"
            onClick={() => onSelect(photo.id)}
            aria-label="View photo"
            className={`w-full rounded-lg ring-2 ring-offset-2 ring-offset-background transition ${
              photo.id === selectedId
                ? 'ring-accent'
                : 'ring-transparent hover:ring-border'
            }`}
          >
            <MemberPhotoDisplay
              memberId={memberId}
              photo={photo}
              size="thumb"
              className="pointer-events-none"
            />
          </button>
        </li>
      ))}
    </ul>
  )
}

export function MemberProfilePrimaryPhoto({
  memberId,
  photo,
  className = '',
}: {
  memberId: string
  photo: ApplicationPhoto | null
  className?: string
}) {
  if (!photo) {
    return (
      <div
        className={`aspect-square w-full rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground ${PROFILE_PRIMARY_IMAGE_CLASS} ${className}`}
      >
        No photo
      </div>
    )
  }

  return (
    <MemberPhotoDisplay
      memberId={memberId}
      photo={photo}
      size="primary"
      showPrimaryBadge
      className={`${PROFILE_PRIMARY_IMAGE_CLASS} ${className}`.trim()}
    />
  )
}

/** Mobile + desktop gallery block: primary with thumbnails attached underneath. */
export function MemberProfileGalleryBlock({
  memberId,
  photos,
  selected,
  selectedId,
  onSelect,
  thumbnailsVariant = 'scroll',
}: {
  memberId: string
  photos: ApplicationPhoto[]
  selected: ApplicationPhoto | null
  selectedId: string | null
  onSelect: (id: string) => void
  thumbnailsVariant?: 'scroll' | 'wrap'
}) {
  if (photos.length === 0) {
    return (
      <div
        className={`aspect-square rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground ${PROFILE_PRIMARY_IMAGE_CLASS}`}
      >
        No profile photos yet.
      </div>
    )
  }

  return (
    <div className="mx-auto grid w-full max-w-[19rem] gap-3 lg:mx-0 lg:max-w-none">
      <MemberProfilePrimaryPhoto memberId={memberId} photo={selected} />
      <ProfileThumbnailStrip
        memberId={memberId}
        photos={photos}
        selectedId={selectedId}
        onSelect={onSelect}
        variant={thumbnailsVariant}
      />
    </div>
  )
}

/** Legacy stacked gallery (admin views). */
export default function MemberPhotoGallery({
  memberId,
  photos,
}: {
  memberId: string
  photos: ApplicationPhoto[]
}) {
  const { selected, selectedId, setSelectedId } = useMemberPhotoSelection(photos)

  return (
    <MemberProfileGalleryBlock
      memberId={memberId}
      photos={photos}
      selected={selected}
      selectedId={selectedId}
      onSelect={setSelectedId}
      thumbnailsVariant="scroll"
    />
  )
}
