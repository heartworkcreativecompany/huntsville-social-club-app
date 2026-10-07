'use client'

import { useCallback, useEffect, useState } from 'react'
import { getMemberPhotoSignedUrl } from '@/app/(club)/member-photos/actions'
import type { ApplicationPhoto } from '@/lib/application'
import { MEMBER_DIRECTORY_CARD_PHOTO_ASPECT_CLASS } from '@/lib/member-photos'

export type MemberPhotoSize =
  | 'thumbnail'
  | 'large'
  | 'primary'
  | 'compact'
  | 'thumb'

export type MemberPhotoDisplayState =
  | 'loading'
  | 'ready'
  | 'error'
  | 'missing'
  | 'unauthorized'

function frameAspectClass(size: MemberPhotoSize): string {
  if (size === 'primary') {
    return `${MEMBER_DIRECTORY_CARD_PHOTO_ASPECT_CLASS} w-full`
  }
  if (size === 'large') return 'aspect-square w-full'
  if (size === 'compact') return 'aspect-square h-14 w-14 shrink-0'
  if (size === 'thumb') return 'aspect-square w-full'
  return `${MEMBER_DIRECTORY_CARD_PHOTO_ASPECT_CLASS} w-20 shrink-0`
}

function frameSurfaceClass(size: MemberPhotoSize): string {
  return size === 'primary' ? 'bg-surface-elevated' : 'bg-accent-soft/30'
}

function photoImageClass(size: MemberPhotoSize): string {
  return size === 'primary'
    ? 'h-full w-full object-contain'
    : 'h-full w-full object-cover'
}

export function MemberPhotoFrame({
  size = 'thumbnail',
  className = '',
  state,
  url,
  errorMessage = null,
  onRetry,
  showPrimaryBadge = false,
  isPrimary = false,
  alt = '',
}: {
  size?: MemberPhotoSize
  className?: string
  state: MemberPhotoDisplayState
  url: string | null
  errorMessage?: string | null
  onRetry?: () => void
  showPrimaryBadge?: boolean
  isPrimary?: boolean
  alt?: string
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-border ${frameSurfaceClass(size)} ${frameAspectClass(size)} ${className}`}
    >
      {state === 'loading' ? (
        <div className="flex h-full min-h-[3.5rem] items-center justify-center text-xs text-muted-foreground">
          Loading…
        </div>
      ) : null}

      {state === 'ready' && url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          className={photoImageClass(size)}
          onError={
            onRetry
              ? () => {
                  onRetry()
                }
              : undefined
          }
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
          <button type="button" className="text-accent underline" onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : null}

      {showPrimaryBadge && isPrimary && state === 'ready' ? (
        <span className="absolute left-1.5 top-1.5 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-medium text-accent-foreground">
          Primary
        </span>
      ) : null}
    </div>
  )
}

export default function MemberPhotoDisplay({
  memberId,
  photo,
  size = 'thumbnail',
  className = '',
  showPrimaryBadge = false,
}: {
  memberId: string
  photo: ApplicationPhoto | null
  size?: MemberPhotoSize
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

  return (
    <MemberPhotoFrame
      size={size}
      className={className}
      state={state}
      url={url}
      errorMessage={errorMessage}
      onRetry={() => {
        void load()
      }}
      showPrimaryBadge={showPrimaryBadge}
      isPrimary={Boolean(photo?.isPrimary)}
      alt=""
    />
  )
}
