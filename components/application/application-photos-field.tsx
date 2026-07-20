'use client'

import { useState } from 'react'
import MemberPhotoDisplay from '@/components/members/member-photo-display'
import type { ApplicationPhoto } from '@/lib/application'
import {
  PHOTO_MAX_COUNT,
  PHOTO_MIN_COUNT,
} from '@/lib/application-form-content'
import {
  deleteApplicationPhotoFromStorage,
  PHOTO_ALLOWED_MIME_TYPES,
  uploadApplicationPhotoToStorage,
  validateApplicationPhotoFile,
} from '@/lib/application-photo-storage'
import {
  buttonSecondaryClassName,
  chipActiveClassName,
  chipInactiveClassName,
} from '@/lib/event-labels'

function PhotoPreview({
  memberId,
  photo,
  onRemove,
  onSetPrimary,
  onConfirmFace,
  removing,
}: {
  memberId: string
  photo: ApplicationPhoto
  onRemove: () => void
  onSetPrimary: () => void
  onConfirmFace: (confirmed: boolean) => void
  removing: boolean
}) {
  return (
    <li className="rounded-xl border border-border bg-surface p-3">
      <MemberPhotoDisplay
        memberId={memberId}
        photo={photo}
        size="large"
        className="w-full"
        showPrimaryBadge={photo.isPrimary}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={
            photo.isPrimary ? chipActiveClassName : chipInactiveClassName
          }
          onClick={onSetPrimary}
          disabled={removing}
        >
          {photo.isPrimary ? 'Primary' : 'Set primary'}
        </button>
        <button
          type="button"
          className="text-xs text-muted-foreground underline disabled:opacity-50"
          onClick={onRemove}
          disabled={removing}
        >
          {removing ? 'Removing…' : 'Remove'}
        </button>
      </div>
      {photo.isPrimary ? (
        <label className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <input
            type="checkbox"
            checked={photo.facePhotoConfirmed}
            onChange={(e) => onConfirmFace(e.target.checked)}
            className="mt-0.5"
            disabled={removing}
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
  memberId,
  photos,
  onChange,
  disabled,
  preserveStoragePaths,
}: {
  memberId: string
  photos: ApplicationPhoto[]
  onChange: (photos: ApplicationPhoto[]) => void
  disabled?: boolean
  /** Live approved paths — do not delete storage when removed from the editor. */
  preserveStoragePaths?: string[]
}) {
  const [message, setMessage] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

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

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList?.length) return

    const file = fileList[0]
    const validationError = validateApplicationPhotoFile(file, photos.length)

    if (validationError) {
      setMessage(validationError)
      return
    }

    setMessage('')
    setIsUploading(true)

    try {
      const result = await uploadApplicationPhotoToStorage(file, photos.length)

      if (result.error) {
        setMessage(result.error)
        return
      }

      if (!result.photo) {
        setMessage('Upload did not complete. Please try again.')
        return
      }

      const next = [...photos, result.photo]
      if (next.length === 1) {
        next[0] = { ...next[0], isPrimary: true }
      }
      onChange(next)
    } catch {
      setMessage('Something went wrong while uploading. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleRemove = async (photo: ApplicationPhoto) => {
    setMessage('')
    setRemovingId(photo.id)

    try {
      const preserveLivePhoto = preserveStoragePaths?.includes(photo.storagePath)
      if (!preserveLivePhoto) {
        const result = await deleteApplicationPhotoFromStorage(photo.storagePath)

        if (result.error) {
          setMessage(result.error)
          return
        }
      }

      const remaining = photos.filter((item) => item.id !== photo.id)
      if (remaining.length > 0 && !remaining.some((item) => item.isPrimary)) {
        remaining[0] = { ...remaining[0], isPrimary: true }
      }
      onChange(remaining)
    } catch {
      setMessage('Could not remove that photo. Please try again.')
    } finally {
      setRemovingId(null)
    }
  }

  const busy = disabled || isUploading || removingId !== null

  return (
    <div className="grid gap-4">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Upload {PHOTO_MIN_COUNT}–{PHOTO_MAX_COUNT} photos (JPEG, PNG, or WebP, max
        5 MB each). Choose one clear face photo as primary—no group shots or
        sunglasses-only images as primary.
      </p>

      <ul className="grid gap-4 sm:grid-cols-2">
        {photos.map((photo) => (
          <PhotoPreview
            key={photo.id}
            memberId={memberId}
            photo={photo}
            onRemove={() => handleRemove(photo)}
            onSetPrimary={() => setPrimary(photo.id)}
            onConfirmFace={(confirmed) =>
              updatePhoto(photo.id, { facePhotoConfirmed: confirmed })
            }
            removing={removingId === photo.id}
          />
        ))}
      </ul>

      {photos.length < PHOTO_MAX_COUNT ? (
        <label
          className={`${buttonSecondaryClassName} inline-flex cursor-pointer items-center justify-center ${
            busy ? 'pointer-events-none opacity-60' : ''
          }`}
        >
          {isUploading ? 'Uploading…' : 'Add photo'}
          <input
            type="file"
            accept={PHOTO_ALLOWED_MIME_TYPES.join(',')}
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              void handleUpload(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
      ) : null}

      {message ? (
        <p className="text-sm text-danger" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  )
}
