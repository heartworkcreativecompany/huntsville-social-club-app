/**
 * Returns true for safe in-app hrefs: must begin with exactly one `/`.
 * Rejects missing, `//`-prefixed, external URLs, protocol URLs, and other non-internal values.
 */
export function isSafeInAppHref(href: string | null | undefined): href is string {
  if (typeof href !== 'string' || href.length === 0) {
    return false
  }
  return href.startsWith('/') && !href.startsWith('//')
}

export function notificationUnreadBadgeLabel(
  unreadCount: number
): string | null {
  if (unreadCount <= 0) {
    return null
  }

  if (unreadCount > 9) {
    return '9+'
  }

  return String(unreadCount)
}

export const NOTIFICATION_INBOX_LIMIT = 20

/** Left-anchored on mobile so a left-side bell does not overflow off-screen. */
export const NOTIFICATION_PANEL_CLASS_NAME =
  'absolute left-0 right-auto z-[60] mt-2 w-[min(22rem,calc(100vw-2rem-env(safe-area-inset-left,0px)-env(safe-area-inset-right,0px)))] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-surface shadow-md lg:left-auto lg:right-0 lg:w-[min(100vw-2.5rem,22rem)]'
