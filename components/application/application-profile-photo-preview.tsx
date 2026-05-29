'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ApplicationPhoto } from '@/lib/application'
import { getApplicationPhotoSignedUrlClient } from '@/lib/application-photo-storage'

type PhotoPreviewState = 'loading' | 'ready' | 'error' | 'missing'

function ApplicationPreviewPhoto({
  photo,
  size,
  onSelect,
  selected,
}: {
  photo: ApplicationPhoto
  size: 'primary' | 'thumb'
  onSelect?: () => void
  selected?: boolean
}) {
  const [state, setState] = useState<PhotoPreviewState>('loading')
  const [url, setUrl] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!photo.storagePath) {
      setState('missing')
      setUrl(null)
      return
    }

    setState('loading')
    const signedUrl = await getApplicationPhotoSignedUrlClient(photo.storagePath)

    if (signedUrl) {
      setUrl(signedUrl)
      setState('ready')
      return
    }

    setUrl(null)
    setState('error')
  }, [photo.storagePath])

  useEffect(() => {
    void load()
  }, [load])

  const aspect =
    size === 'primary' ? 'aspect-[4/5] w-full max-h-[28rem]' : 'aspect-square w-full'

  const inner = (
    <div
      className={`relative overflow-hidden rounded-lg border border-border bg-accent-soft/30 ${aspect}`}
    >
      {state === 'loading' ? (
        <div className="flex h-full min-h-[5rem] items-center justify-center text-xs text-muted-foreground">
          Loading photo…
        </div>
      ) : null}

      {state === 'ready' && url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          onError={() => {
            void load()
          }}
        />
      ) : null}

      {state === 'missing' ? (
        <div className="flex h-full min-h-[5rem] items-center justify-center px-2 text-center text-xs text-muted-foreground">
          No photo
        </div>
      ) : null}

      {state === 'error' ? (
        <div className="flex h-full min-h-[5rem] flex-col items-center justify-center gap-2 px-2 text-center text-xs text-muted-foreground">
          <span>Preview unavailable</span>
          <button
            type="button"
            className="text-accent underline"
            onClick={(e) => {
              e.stopPropagation()
              void load()
            }}
          >
            Refresh
          </button>
        </div>
      ) : null}

      {photo.isPrimary && state === 'ready' && size === 'primary' ? (
        <span className="absolute left-3 top-3 rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
          Primary photo
        </span>
      ) : null}
    </div>
  )

  if (onSelect) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={`w-full rounded-lg text-left ring-2 ring-offset-2 ring-offset-background transition ${
          selected ? 'ring-accent' : 'ring-transparent hover:ring-border'
        }`}
      >
        {inner}
      </button>
    )
  }

  return inner
}

export default function ApplicationProfilePhotoPreview({
  photos,
}: {
  photos: ApplicationPhoto[]
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    photos.find((p) => p.isPrimary)?.id ?? photos[0]?.id ?? null
  )

  const selected =
    photos.find((photo) => photo.id === selectedId) ?? photos[0] ?? null

  if (photos.length === 0) {
    return (
      <CardPlaceholder message="Add at least two photos to see how they will appear on your profile." />
    )
  }

  return (
    <div className="grid gap-4">
      {selected ? (
        <ApplicationPreviewPhoto photo={selected} size="primary" />
      ) : null}

      {photos.length > 1 ? (
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {photos.map((photo) => (
            <li key={photo.id}>
              <ApplicationPreviewPhoto
                photo={photo}
                size="thumb"
                selected={photo.id === selected?.id}
                onSelect={() => setSelectedId(photo.id)}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function CardPlaceholder({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-background/50 px-4 py-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}
