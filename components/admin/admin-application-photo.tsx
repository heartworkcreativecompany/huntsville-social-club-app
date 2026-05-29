'use client'

import { useCallback, useEffect, useState } from 'react'
import { getAdminApplicationPhotoSignedUrl } from '@/app/(club)/admin/applications/photo-actions'
import type { ApplicationPhoto } from '@/lib/application'

type PreviewState = 'loading' | 'ready' | 'error' | 'missing'

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
  const [state, setState] = useState<PreviewState>(photo ? 'loading' : 'missing')
  const [url, setUrl] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!photo?.storagePath) {
      setState('missing')
      setUrl(null)
      return
    }

    setState('loading')
    setErrorMessage(null)

    const result = await getAdminApplicationPhotoSignedUrl(
      applicantId,
      photo.storagePath
    )

    if (result.url) {
      setUrl(result.url)
      setState('ready')
      return
    }

    setUrl(null)
    setErrorMessage(result.error ?? 'Preview unavailable')
    setState('error')
  }, [applicantId, photo])

  useEffect(() => {
    void load()
  }, [load])

  const aspect =
    size === 'large' ? 'aspect-[4/5] max-h-[28rem]' : 'aspect-[4/5] w-20'

  return (
    <div className={className}>
      <div
        className={`relative overflow-hidden rounded-lg border border-border bg-accent-soft/30 ${aspect} ${
          size === 'large' ? 'w-full' : 'shrink-0'
        }`}
      >
        {state === 'loading' ? (
          <div className="flex h-full min-h-[5rem] items-center justify-center text-xs text-muted-foreground">
            Loading…
          </div>
        ) : null}

        {state === 'ready' && url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : null}

        {state === 'missing' ? (
          <div className="flex h-full min-h-[5rem] items-center justify-center px-2 text-center text-xs text-muted-foreground">
            No photo
          </div>
        ) : null}

        {state === 'error' ? (
          <div className="flex h-full min-h-[5rem] flex-col items-center justify-center gap-2 px-2 text-center text-xs text-muted-foreground">
            <span>{errorMessage}</span>
            <button
              type="button"
              className="text-accent underline"
              onClick={() => void load()}
            >
              Retry
            </button>
          </div>
        ) : null}

        {photo?.isPrimary && state === 'ready' ? (
          <span className="absolute left-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
            Primary
          </span>
        ) : null}
      </div>
    </div>
  )
}
