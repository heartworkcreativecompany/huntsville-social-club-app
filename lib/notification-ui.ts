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
  'absolute left-0 right-auto z-[60] mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-surface shadow-md lg:left-auto lg:right-0 lg:w-[min(100vw-2.5rem,22rem)]'
