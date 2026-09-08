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
