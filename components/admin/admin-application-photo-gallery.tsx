'use client'

import { useState } from 'react'
import type { ApplicationPhoto } from '@/lib/application'
import AdminApplicationPhoto from './admin-application-photo'

export default function AdminApplicationPhotoGallery({
  applicantId,
  photos,
}: {
  applicantId: string
  photos: ApplicationPhoto[]
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    photos.find((p) => p.isPrimary)?.id ?? photos[0]?.id ?? null
  )

  const selected =
    photos.find((photo) => photo.id === selectedId) ?? photos[0] ?? null

  if (photos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No application photos uploaded yet.
      </p>
    )
  }

  return (
    <div className="grid gap-4">
      <AdminApplicationPhoto
        applicantId={applicantId}
        photo={selected}
        size="large"
      />

      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
        {photos.map((photo) => (
          <li key={photo.id}>
            <button
              type="button"
              onClick={() => setSelectedId(photo.id)}
              className={`w-full rounded-lg ring-2 ring-offset-2 ring-offset-background transition ${
                photo.id === selected?.id
                  ? 'ring-accent'
                  : 'ring-transparent hover:ring-border'
              }`}
            >
              <AdminApplicationPhoto
                applicantId={applicantId}
                photo={photo}
                size="thumbnail"
                className="pointer-events-none"
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Queue row thumbnail — primary or first photo only. */
export function AdminApplicationPhotoThumbnail({
  applicantId,
  photos,
}: {
  applicantId: string
  photos: ApplicationPhoto[]
}) {
  const photo =
    photos.find((item) => item.isPrimary) ?? photos[0] ?? null

  if (!photo) {
    return null
  }

  return (
    <AdminApplicationPhoto
      applicantId={applicantId}
      photo={photo}
      size="thumbnail"
    />
  )
}
