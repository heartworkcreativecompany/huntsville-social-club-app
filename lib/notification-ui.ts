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
