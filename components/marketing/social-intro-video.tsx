'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Image from 'next/image'
import {
  shouldAutoplayMutedVideo,
  type SocialIntroCaptionTrack,
} from '@/lib/social-intro-video'

export default function SocialIntroVideo({
  src,
  posterSrc = '/brand/hsc-huntsville.jpg',
  posterAlt = 'Huntsville skyline at dusk',
  captions = [],
  title = 'Huntsville Social Club intro',
  autoPlayMuted = false,
}: {
  src?: string | null
  posterSrc?: string
  posterAlt?: string
  captions?: readonly SocialIntroCaptionTrack[]
  title?: string
  /** Muted only. Ignored when there is no source or the visitor prefers reduced motion. */
  autoPlayMuted?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const titleId = useId()
  const hasSrc = Boolean(src)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches

    if (
      !shouldAutoplayMutedVideo({
        hasSrc: true,
        autoPlayMuted,
        prefersReducedMotion,
      })
    ) {
      return
    }

    video.muted = true
    video.defaultMuted = true
    void video.play().then(
      () => setIsPlaying(true),
      () => setIsPlaying(false)
    )
  }, [src, autoPlayMuted])

  async function togglePlayback() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      try {
        await video.play()
        setIsPlaying(true)
      } catch {
        setIsPlaying(false)
      }
      return
    }
    video.pause()
    setIsPlaying(false)
  }

  return (
    <figure className="mx-auto w-full max-w-[20rem]">
      <div
        className="relative overflow-hidden rounded-2xl border border-white/15 bg-black shadow-lg"
        style={{ aspectRatio: '9 / 16' }}
      >
        {hasSrc ? (
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            poster={posterSrc}
            playsInline
            preload="metadata"
            muted={autoPlayMuted}
            controls={false}
            aria-labelledby={titleId}
          >
            <source src={src ?? undefined} />
            {captions.map((track) => (
              <track
                key={`${track.srcLang}-${track.src}`}
                kind={track.kind ?? 'captions'}
                src={track.src}
                srcLang={track.srcLang}
                label={track.label}
                default={track.default}
              />
            ))}
          </video>
        ) : (
          <Image
            src={posterSrc}
            alt={posterAlt}
            fill
            sizes="(max-width: 640px) 80vw, 20rem"
            className="object-cover"
          />
        )}

        <div
          className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-black/10"
          aria-hidden
        />

        <button
          type="button"
          className="absolute inset-0 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80 focus-visible:ring-inset disabled:cursor-not-allowed"
          onClick={hasSrc ? togglePlayback : undefined}
          disabled={!hasSrc}
          aria-label={
            hasSrc
              ? isPlaying
                ? `Pause ${title}`
                : `Play ${title}`
              : 'Intro video coming soon'
          }
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/40 bg-black/45 text-white shadow-md backdrop-blur-sm">
            {hasSrc && isPlaying ? (
              <PauseIcon />
            ) : (
              <PlayIcon />
            )}
          </span>
        </button>
      </div>
      <figcaption id={titleId} className="sr-only">
        {title}
      </figcaption>
    </figure>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ml-0.5 h-7 w-7 fill-current" aria-hidden>
      <path d="M8 5.14v13.72L19.5 12 8 5.14z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current" aria-hidden>
      <path d="M7 5h3.5v14H7V5zm6.5 0H17v14h-3.5V5z" />
    </svg>
  )
}
