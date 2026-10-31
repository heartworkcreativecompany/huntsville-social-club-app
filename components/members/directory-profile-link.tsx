'use client'

import { useLayoutEffect } from 'react'
import Link from 'next/link'
import {
  clearDirectoryScrollMark,
  currentDirectoryHref,
  directoryScrollMarkForHref,
  readDirectoryScrollRaw,
  writeDirectoryScrollMark,
  type DirectoryScrollMark,
} from '@/lib/directory-scroll'

function contentScroller(): HTMLElement | null {
  const scroller = document.querySelector('[data-club-content-scroll]')
  return scroller instanceof HTMLElement ? scroller : null
}

export function rememberDirectoryScroll(cardId: string) {
  try {
    const scroller = contentScroller()
    const mark: DirectoryScrollMark = {
      href: currentDirectoryHref(window.location),
      cardId,
      scrollTop: scroller?.scrollTop ?? 0,
    }
    writeDirectoryScrollMark(window.sessionStorage, mark)
  } catch {
    // Opening the profile still follows the link when storage is blocked.
  }
}

function applyDirectoryScroll(mark: DirectoryScrollMark) {
  const scroller = contentScroller()
  if (!scroller) return
  const card = scroller.querySelector(
    `[data-directory-card="${CSS.escape(mark.cardId)}"]`
  )
  if (card instanceof HTMLElement) {
    const delta =
      card.getBoundingClientRect().top - scroller.getBoundingClientRect().top
    scroller.scrollTop += delta - 16
    return
  }
  scroller.scrollTop = mark.scrollTop
}

/**
 * One-shot restore for the directory card that opened a profile.
 * Cleared after the return settles, and cancelled if the reader scrolls,
 * so later Back/Forward navigation is left to the browser.
 */
export function DirectoryScrollRestore() {
  useLayoutEffect(() => {
    const href = currentDirectoryHref(window.location)
    let storage: Storage | null = null
    try {
      storage = window.sessionStorage
    } catch {
      return
    }
    const mark = directoryScrollMarkForHref(readDirectoryScrollRaw(storage), href)
    if (!mark) return

    let stopped = false
    const apply = () => {
      if (!stopped) applyDirectoryScroll(mark)
    }
    const stop = () => {
      if (stopped) return
      stopped = true
      clearDirectoryScrollMark(storage)
    }

    apply()
    const frame = window.requestAnimationFrame(apply)
    const followUps = [50, 150].map((delay) => window.setTimeout(apply, delay))
    const settle = window.setTimeout(stop, 400)
    const scroller = contentScroller()
    scroller?.addEventListener('wheel', stop, { passive: true, once: true })
    scroller?.addEventListener('touchmove', stop, { passive: true, once: true })

    return () => {
      stopped = true
      window.cancelAnimationFrame(frame)
      followUps.forEach((timer) => window.clearTimeout(timer))
      window.clearTimeout(settle)
      scroller?.removeEventListener('wheel', stop)
      scroller?.removeEventListener('touchmove', stop)
    }
  }, [])

  return null
}

export default function DirectoryProfileLink({
  href,
  memberId,
  className,
  children,
}: {
  href: string
  memberId: string
  className: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      data-directory-card={memberId}
      className={className}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        ) {
          return
        }
        rememberDirectoryScroll(memberId)
      }}
    >
      {children}
    </Link>
  )
}
