'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  deleteApplicationPhoto,
  getApplicationPhotoSignedUrl,
  uploadApplicationPhoto,
} from '@/app/(club)/application/actions'
import type { ApplicationPhoto } from '@/lib/application'
import {
  PHOTO_MAX_COUNT,
  PHOTO_MIN_COUNT,
} from '@/lib/application-form-content'
import { buttonSecondaryClassName } from '@/lib/event-labels'

function PhotoPreview({
  photo,
  onRemove,
  onSetPrimary,
  onConfirmFace,
}: {
  photo: ApplicationPhoto
  onRemove: () => void
  onSetPrimary: () => void
  onConfirmFace: (confirmed: boolean) => void
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getApplicationPhotoSignedUrl(photo.storagePath).then((result) => {
      if (!cancelled) setUrl(result.url)
    })
    return () => {
      cancelled = true
    }
  }, [photo.storagePath])

  return (
    <li className="rounded-lg border border-border bg-background/50 p-3">
      <div className="aspect-[4/5] overflow-hidden rounded-md bg-accent-soft/30">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Loading…
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            photo.isPrimary
              ? 'bg-accent text-accent-foreground'
              : 'bg-accent-soft text-muted-foreground'
          }`}
          onClick={onSetPrimary}
        >
          {photo.isPrimary ? 'Primary' : 'Set primary'}
        </button>
        <button
          type="button"
          className="text-xs text-muted-foreground underline"
          onClick={onRemove}
        >
          Remove
        </button>
      </div>
      {photo.isPrimary ? (
        <label className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <input
            type="checkbox"
            checked={photo.facePhotoConfirmed}
            onChange={(e) => onConfirmFace(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            This is a clear face photo (not a group shot, not sunglasses-only,
            and appropriate for a member directory).
          </span>
        </label>
      ) : null}
    </li>
  )
}

export default function ApplicationPhotosField({
  photos,
  onChange,
  disabled,
}: {
  photos: ApplicationPhoto[]
  onChange: (photos: ApplicationPhoto[]) => void
  disabled?: boolean
}) {
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const setPrimary = (id: string) => {
    onChange(
      photos.map((photo) => ({
        ...photo,
        isPrimary: photo.id === id,
        facePhotoConfirmed:
          photo.id === id ? photo.facePhotoConfirmed : false,
      }))
    )
  }

  const updatePhoto = (id: string, patch: Partial<ApplicationPhoto>) => {
    onChange(
      photos.map((photo) =>
        photo.id === id ? { ...photo, ...patch } : photo
      )
    )
  }

  const handleUpload = (fileList: FileList | null) => {
    if (!fileList?.length) return
    if (photos.length >= PHOTO_MAX_COUNT) {
      setMessage(`You can upload up to ${PHOTO_MAX_COUNT} photos.`)
      return
    }

    const file = fileList[0]
    const formData = new FormData()
    formData.set('file', file)

    setMessage('')
    startTransition(async () => {
      const result = await uploadApplicationPhoto(formData)
      if (result.error) {
        setMessage(result.error)
        return
      }
      if (!result.photo) return

      const next = [...photos, result.photo]
      if (next.length === 1) {
        next[0] = { ...next[0], isPrimary: true }
      }
      onChange(next)
    })
  }

  const handleRemove = (photo: ApplicationPhoto) => {
    startTransition(async () => {
      await deleteApplicationPhoto(photo.storagePath)
      const remaining = photos.filter((item) => item.id !== photo.id)
      if (remaining.length > 0 && !remaining.some((item) => item.isPrimary)) {
        remaining[0] = { ...remaining[0], isPrimary: true }
      }
      onChange(remaining)
    })
  }

  return (
    <div className="grid gap-4">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Upload {PHOTO_MIN_COUNT}–{PHOTO_MAX_COUNT} photos. Choose one clear face
        photo as primary—no group shots or sunglasses-only images as primary.
      </p>

      <ul className="grid gap-4 sm:grid-cols-2">
        {photos.map((photo) => (
          <PhotoPreview
            key={photo.id}
            photo={photo}
            onRemove={() => handleRemove(photo)}
            onSetPrimary={() => setPrimary(photo.id)}
            onConfirmFace={(confirmed) =>
              updatePhoto(photo.id, { facePhotoConfirmed: confirmed })
            }
          />
        ))}
      </ul>

      {photos.length < PHOTO_MAX_COUNT ? (
        <label
          className={`${buttonSecondaryClassName} inline-flex cursor-pointer items-center justify-center`}
        >
          {isPending ? 'Uploading…' : 'Add photo'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={disabled || isPending}
            onChange={(e) => {
              handleUpload(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
      ) : null}

      {message ? (
        <p className="text-sm text-muted-foreground">{message}</p>
      ) : null}
    </div>
  )
}
