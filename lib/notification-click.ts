import { isSafeInAppHref } from '@/lib/notification-ui'

export type NotificationClickTarget = {
  id: string
  href: string | null | undefined
  readAt: string | null
}

export type NotificationClickPlan = {
  skip: boolean
  closePanel: boolean
  markRead: boolean
  navigateTo: string | null
}

const locallyReadIds = new Set<string>()
let markAllActive = false
let markAllSnapshotIds = new Set<string>()

function persistReturnedError(result: unknown): boolean {
  return Boolean(result && typeof result === 'object' && 'error' in result)
}

/** Survives ClubNav remounts on pathname change so unread UI does not snap back. */
export function rememberNotificationsRead(ids: string[]): void {
  for (const id of ids) {
    locallyReadIds.add(id)
  }
}

export function forgetNotificationsRead(ids: string[]): void {
  for (const id of ids) {
    locallyReadIds.delete(id)
  }
}

export function rememberAllNotificationsRead(visibleUnreadIds: string[]): void {
  markAllActive = true
  markAllSnapshotIds = new Set(visibleUnreadIds)
}

export function applyLocalNotificationReads<
  T extends { id: string; readAt: string | null },
>(items: T[], unreadCount: number): { items: T[]; unreadCount: number } {
  if (locallyReadIds.size === 0 && !markAllActive) {
    return { items, unreadCount }
  }

  if (markAllActive && unreadCount === 0) {
    return { items, unreadCount: 0 }
  }

  const incomingUnreadIds = items
    .filter((item) => !item.readAt)
    .map((item) => item.id)
  const hideAllVisible =
    markAllActive && incomingUnreadIds.every((id) => markAllSnapshotIds.has(id))

  let reduced = 0
  const next = items.map((item) => {
    if (item.readAt) {
      return item
    }
    const overlay =
      locallyReadIds.has(item.id) ||
      hideAllVisible ||
      (markAllActive && markAllSnapshotIds.has(item.id))
    if (!overlay) {
      return item
    }
    reduced += 1
    return { ...item, readAt: new Date().toISOString() }
  })

  if (hideAllVisible) {
    return { items: next, unreadCount: 0 }
  }

  return { items: next, unreadCount: Math.max(0, unreadCount - reduced) }
}

export function resetLocalNotificationReadsForTests(): void {
  locallyReadIds.clear()
  markAllActive = false
  markAllSnapshotIds = new Set()
}

/**
 * Models the dual-mounted-bell race: every mounted bell with an open panel
 * attaches a document `mousedown` listener. A click inside the visible panel
 * is outside the hidden panel, so the hidden listener closes shared `open`
 * before the visible row's `click` handler runs.
 */
export function sharedNotificationPanelStaysOpenAfterMousedown(args: {
  mountedPanelContainsTarget: boolean[]
}): boolean {
  let open = true
  for (const containsTarget of args.mountedPanelContainsTarget) {
    if (!containsTarget) {
      open = false
    }
  }
  return open
}

export function planNotificationClick(
  notification: NotificationClickTarget,
  pendingIds: ReadonlySet<string>
): NotificationClickPlan {
  if (pendingIds.has(notification.id)) {
    return {
      skip: true,
      closePanel: false,
      markRead: false,
      navigateTo: null,
    }
  }

  return {
    skip: false,
    closePanel: true,
    markRead: !notification.readAt,
    navigateTo: isSafeInAppHref(notification.href) ? notification.href : null,
  }
}

export function applyNotificationClick(
  plan: NotificationClickPlan,
  pendingIds: Set<string>,
  notificationId: string,
  actions: {
    closePanel: () => void
    markOptimisticRead: () => void
    persistRead: () => Promise<unknown>
    navigate: (href: string) => void
  }
): void {
  if (plan.skip) {
    return
  }

  if (plan.closePanel) {
    actions.closePanel()
  }

  if (plan.markRead) {
    pendingIds.add(notificationId)
    rememberNotificationsRead([notificationId])
    actions.markOptimisticRead()
  }

  if (plan.navigateTo) {
    actions.navigate(plan.navigateTo)
  }

  if (plan.markRead) {
    void (async () => {
      try {
        const result = await actions.persistRead()
        if (persistReturnedError(result)) {
          forgetNotificationsRead([notificationId])
        }
      } catch {
        forgetNotificationsRead([notificationId])
      } finally {
        pendingIds.delete(notificationId)
      }
    })()
  }
}
