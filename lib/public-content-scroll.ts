export function publicContentScrollTop(
  scrollTop: number,
  nodeTop: number,
  scrollerTop: number,
  offset = 16
): number {
  return Math.max(0, scrollTop + nodeTop - scrollerTop - offset)
}

/** Scroll the public marketing scroller so a destination sits below the header. */
export function scrollPublicContent(node: HTMLElement) {
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth'
  const scroller = node.closest('[data-public-content-scroll]')
  if (!(scroller instanceof HTMLElement)) {
    node.scrollIntoView({ block: 'start', behavior })
    return
  }

  const top = publicContentScrollTop(
    scroller.scrollTop,
    node.getBoundingClientRect().top,
    scroller.getBoundingClientRect().top
  )
  scroller.scrollTo({ top, behavior })
}
