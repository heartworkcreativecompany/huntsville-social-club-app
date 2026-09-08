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

/** Survives ClubNav remounts on pathname change so unread UI does not snap back. */
export function rememberNotificationsRead(ids: string[]): void {
  for (const id of ids) {
    locallyReadIds.add(id)
  }
}

export function applyLocalNotificationReads<
  T extends { id: string; readAt: string | null },
>(items: T[], unreadCount: number): { items: T[]; unreadCount: number } {
  if (locallyReadIds.size === 0) {
    return { items, unreadCount }
  }

  let reduced = 0
  const next = items.map((item) => {
    if (item.readAt || !locallyReadIds.has(item.id)) {
      return item
    }
    reduced += 1
    return { ...item, readAt: new Date().toISOString() }
  })

  return { items: next, unreadCount: Math.max(0, unreadCount - reduced) }
}

export function resetLocalNotificationReadsForTests(): void {
  locallyReadIds.clear()
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
        await actions.persistRead()
      } catch {
        // Optimistic unread/read UI already applied; persistence errors stay local.
      } finally {
        pendingIds.delete(notificationId)
      }
    })()
  }
}
