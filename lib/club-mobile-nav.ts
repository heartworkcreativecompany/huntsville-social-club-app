export const CLUB_MOBILE_NAV_ID = 'club-mobile-nav'
export const CLUB_MOBILE_NAV_MEDIA_QUERY = '(min-width: 1024px)'

export function mobileNavToggleLabel(open: boolean): string {
  return open ? 'Close navigation menu' : 'Open navigation menu'
}

export function isMobileNavEscapeKey(key: string): boolean {
  return key === 'Escape'
}

export function isOutsideMobileNav(
  target: EventTarget | null,
  container: { contains: (node: Node) => boolean } | null
): boolean {
  if (!container || target == null) {
    return true
  }

  return !container.contains(target as Node)
}
