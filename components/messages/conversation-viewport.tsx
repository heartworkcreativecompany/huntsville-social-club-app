'use client'

import { useLayoutEffect, useRef } from 'react'

const MIN_MESSAGE_LIST_PX = 160

function syncConversationFrame(frame: HTMLElement) {
  const scrollParent = frame.closest('[data-club-content-scroll]')
  if (!(scrollParent instanceof HTMLElement)) {
    frame.style.height = ''
    return
  }

  const frameTop = () =>
    frame.getBoundingClientRect().top -
    scrollParent.getBoundingClientRect().top +
    scrollParent.scrollTop

  const viewEnd = scrollParent.scrollTop + scrollParent.clientHeight
  const frameEndBefore = frameTop() + frame.offsetHeight
  if (scrollParent.scrollTop > 0 && viewEnd > frameEndBefore + 24) {
    return
  }

  const available = scrollParent.clientHeight - frameTop()
  let height = Math.max(0, available)
  frame.style.height = `${height}px`

  const scroller = frame.querySelector('[data-message-scroll]')
  if (scroller instanceof HTMLElement) {
    const deficit = MIN_MESSAGE_LIST_PX - scroller.clientHeight
    if (deficit > 1) {
      height += deficit
      frame.style.height = `${height}px`
    }
  }

  const composer = frame.querySelector('form, [data-message-composer]')
  if (composer instanceof HTMLElement) {
    const hidden =
      composer.getBoundingClientRect().bottom - frame.getBoundingClientRect().bottom
    if (hidden > 1) {
      height += hidden
      frame.style.height = `${height}px`
    }
  }

  const frameStart = frameTop()
  const frameEnd = frameStart + frame.offsetHeight
  const overflow = frameEnd - viewEnd
  const pastFrame = viewEnd > frameEnd + 24
  const keepComposerInView =
    scrollParent.scrollTop === 0 || Math.abs(viewEnd - frameEnd) < 80
  if (overflow > 1 && !pastFrame && keepComposerInView) {
    scrollParent.scrollTop = Math.max(0, frameEnd - scrollParent.clientHeight)
  }
}

/** Fill the visible club content area without scrolling the site header. */
export default function ConversationViewport({
  children,
}: {
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const frame = ref.current
    if (!frame) return

    const apply = () => syncConversationFrame(frame)
    apply()

    const scrollParent = frame.closest('[data-club-content-scroll]')
    const observer = new ResizeObserver(apply)
    if (scrollParent instanceof HTMLElement) observer.observe(scrollParent)

    const viewport = window.visualViewport
    viewport?.addEventListener('resize', apply)
    viewport?.addEventListener('scroll', apply)
    window.addEventListener('orientationchange', apply)

    return () => {
      observer.disconnect()
      viewport?.removeEventListener('resize', apply)
      viewport?.removeEventListener('scroll', apply)
      window.removeEventListener('orientationchange', apply)
    }
  }, [])

  return (
    <div
      ref={ref}
      data-conversation-viewport
      className="flex min-h-0 flex-col pb-[env(safe-area-inset-bottom)]"
    >
      {children}
    </div>
  )
}
