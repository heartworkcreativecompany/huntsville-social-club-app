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

export type ClubHeaderOverlay = 'none' | 'mobileNav' | 'notifications'

/** Only one header overlay is open at a time. */
export function clubHeaderOverlayAfterOpen(
  opened: Exclude<ClubHeaderOverlay, 'none'>
): { mobileNavOpen: boolean; notificationsOpen: boolean } {
  return {
    mobileNavOpen: opened === 'mobileNav',
    notificationsOpen: opened === 'notifications',
  }
}
