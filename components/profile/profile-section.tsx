'use client'

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'

const openers = new Map<string, Set<(target: HTMLElement | null) => void>>()

export function revealProfileSection(
  id: string,
  target?: HTMLElement | null
) {
  openers.get(id)?.forEach((open) => open(target ?? null))
}

export function scrollWithinClubContent(node: HTMLElement) {
  const scroller = node.closest('[data-club-content-scroll]')
  const reduceMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches
  const behavior: ScrollBehavior = reduceMotion ? 'auto' : 'smooth'

  if (scroller instanceof HTMLElement) {
    const top =
      scroller.scrollTop +
      node.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top -
      16
    scroller.scrollTo({ top: Math.max(0, top), behavior })
    return
  }

  node.scrollIntoView({ block: 'start', behavior })
}

function SectionChevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={`h-5 w-5 shrink-0 text-accent motion-safe:transition-transform ${
        open ? 'rotate-180' : ''
      }`}
    >
      <path
        d="M5 7.5 10 12.5 15 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function ProfileSection({
  id,
  title,
  summary,
  children,
}: {
  id: string
  title: string
  summary?: string
  children: ReactNode
}) {
  const reactId = useId().replace(/:/g, '')
  const headingId = `profile-section-${reactId}-heading`
  const panelId = `profile-section-${reactId}-panel`
  const [open, setOpen] = useState(false)
  const [revealCount, setRevealCount] = useState(0)
  const pendingTarget = useRef<HTMLElement | null>(null)
  const openSection = useCallback((target: HTMLElement | null) => {
    pendingTarget.current = target
    setOpen(true)
    setRevealCount((count) => count + 1)
  }, [])

  useEffect(() => {
    let set = openers.get(id)
    if (!set) {
      set = new Set()
      openers.set(id, set)
    }
    set.add(openSection)
    return () => {
      set.delete(openSection)
      if (set.size === 0) openers.delete(id)
    }
  }, [id, openSection])

  useEffect(() => {
    const openFromHash = () => {
      if (window.location.hash !== `#${id}`) return
      openSection(document.getElementById(id))
    }
    openFromHash()
    window.addEventListener('hashchange', openFromHash)
    return () => window.removeEventListener('hashchange', openFromHash)
  }, [id, openSection])

  useEffect(() => {
    if (revealCount === 0) return
    const target = pendingTarget.current
    pendingTarget.current = null
    const section = document.getElementById(id)
    let frames = 0

    const attempt = () => {
      const node = target?.isConnected ? target : section
      if (!node) return
      const rect = node.getBoundingClientRect()
      if (rect.height === 0 && frames < 6) {
        frames += 1
        requestAnimationFrame(attempt)
        return
      }
      scrollWithinClubContent(node)
    }

    requestAnimationFrame(attempt)
  }, [id, revealCount])

  return (
    <section id={id} className="min-w-0">
      <h2 id={headingId} className="lg:hidden">
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="min-w-0 flex-1">
            <span className="text-display block text-base font-semibold text-foreground">
              {title}
            </span>
            {summary ? (
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {summary}
              </span>
            ) : null}
          </span>
          <SectionChevron open={open} />
        </button>
      </h2>
      <div
        id={panelId}
        role="region"
        aria-labelledby={headingId}
        className={
          open
            ? 'max-lg:[&_.profile-section-title]:hidden'
            : 'max-lg:hidden max-lg:[&_.profile-section-title]:hidden'
        }
      >
        {children}
      </div>
    </section>
  )
}
