'use client'

import { useCallback, useEffect, useState } from 'react'
import { getMemberPhotoSignedUrl } from '@/app/(club)/member-photos/actions'
import type { ApplicationPhoto } from '@/lib/application'

export type MemberPhotoDisplayState =
  | 'loading'
  | 'ready'
  | 'error'
  | 'missing'
  | 'unauthorized'

export default function MemberPhotoDisplay({
  memberId,
  photo,
  size = 'thumbnail',
  className = '',
  showPrimaryBadge = false,
}: {
  memberId: string
  photo: ApplicationPhoto | null
  size?: 'thumbnail' | 'large' | 'primary' | 'compact' | 'thumb'
  className?: string
  showPrimaryBadge?: boolean
}) {
  const [state, setState] = useState<MemberPhotoDisplayState>(
    photo ? 'loading' : 'missing'
  )
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

    const result = await getMemberPhotoSignedUrl(memberId, photo.storagePath)

    if (result.url) {
      setUrl(result.url)
      setState('ready')
      return
    }

    setUrl(null)
    setErrorMessage(result.error ?? 'Photo unavailable')
    setState(result.unauthorized ? 'unauthorized' : 'error')
  }, [memberId, photo])

  useEffect(() => {
    void load()
  }, [load])

  const aspect =
    size === 'primary' || size === 'large'
      ? 'aspect-square w-full'
      : size === 'compact'
        ? 'aspect-square h-14 w-14 shrink-0'
        : size === 'thumb'
          ? 'aspect-square w-full'
          : 'aspect-[4/5] w-20 shrink-0'

  return (
    <div className={`relative overflow-hidden rounded-lg border border-border bg-accent-soft/30 ${aspect} ${className}`}>
      {state === 'loading' ? (
        <div className="flex h-full min-h-[3.5rem] items-center justify-center text-xs text-muted-foreground">
          Loading…
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
        <div className="flex h-full min-h-[3.5rem] items-center justify-center px-1 text-center text-[10px] text-muted-foreground">
          No photo
        </div>
      ) : null}

      {state === 'unauthorized' ? (
        <div className="flex h-full min-h-[3.5rem] items-center justify-center px-1 text-center text-[10px] text-muted-foreground">
          Private
        </div>
      ) : null}

      {state === 'error' ? (
        <div className="flex h-full min-h-[3.5rem] flex-col items-center justify-center gap-1 px-1 text-center text-[10px] text-muted-foreground">
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

      {showPrimaryBadge && photo?.isPrimary && state === 'ready' ? (
        <span className="absolute left-1.5 top-1.5 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-medium text-accent-foreground">
          Primary
        </span>
      ) : null}
    </div>
  )
}
