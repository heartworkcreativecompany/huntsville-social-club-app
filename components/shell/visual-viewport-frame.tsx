'use client'

import { useLayoutEffect, useRef } from 'react'

/**
 * Pin the club frame to the visible viewport. Ancestor overflow clipping
 * prevents position: sticky from following the document, so the header stays
 * put by living outside the content scroller while this frame tracks the
 * keyboard and visual viewport.
 */
export default function VisualViewportFrame({
  children,
}: {
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const frame = ref.current
    const viewport = window.visualViewport
    if (!frame || !viewport) return

    const apply = () => {
      frame.style.height = `${viewport.height}px`
      frame.style.transform =
        viewport.offsetTop > 0 ? `translateY(${viewport.offsetTop}px)` : ''
      frame.style.setProperty('--club-frame-height', `${viewport.height}px`)
    }

    apply()
    viewport.addEventListener('resize', apply)
    viewport.addEventListener('scroll', apply)
    window.addEventListener('orientationchange', apply)

    return () => {
      viewport.removeEventListener('resize', apply)
      viewport.removeEventListener('scroll', apply)
      window.removeEventListener('orientationchange', apply)
    }
  }, [])

  return (
    <div
      ref={ref}
      className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background"
    >
      {children}
    </div>
  )
}
