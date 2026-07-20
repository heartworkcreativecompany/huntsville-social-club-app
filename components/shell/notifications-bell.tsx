'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  markAllNotificationsRead,
  markNotificationRead,
} from '@/app/(club)/notifications/actions'
import { formatNotificationRelativeTime } from '@/lib/format-notification-time'
import type { MemberNotificationItem } from '@/lib/load-member-notifications'
import { notificationUnreadBadgeLabel } from '@/lib/notification-ui'
import { navLinkClassName } from '@/components/shell/nav-link-class'

function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

export default function NotificationsBell({
  items: initialItems,
  unreadCount: initialUnreadCount,
}: {
  items: MemberNotificationItem[]
  unreadCount: number
}) {
  const router = useRouter()
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(initialItems)
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setItems(initialItems)
    setUnreadCount(initialUnreadCount)
  }, [initialItems, initialUnreadCount])

  useEffect(() => {
    if (!open) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const handleNotificationClick = (notification: MemberNotificationItem) => {
    setOpen(false)

    if (!notification.readAt) {
      setItems((current) =>
        current.map((item) =>
          item.id === notification.id
            ? { ...item, readAt: new Date().toISOString() }
            : item
        )
      )
      setUnreadCount((count) => Math.max(0, count - 1))
    }

    startTransition(async () => {
      if (!notification.readAt) {
        await markNotificationRead(notification.id)
      }
      router.push(notification.href)
      router.refresh()
    })
  }

  const handleMarkAllRead = () => {
    startTransition(async () => {
      const result = await markAllNotificationsRead()
      if ('success' in result) {
        setItems((current) =>
          current.map((item) => ({
            ...item,
            readAt: item.readAt ?? new Date().toISOString(),
          }))
        )
        setUnreadCount(0)
        router.refresh()
      }
    })
  }

  const badgeLabel = notificationUnreadBadgeLabel(unreadCount)

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`${navLinkClassName(false)} relative inline-flex items-center justify-center px-2.5`}
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : 'Notifications'
        }
        aria-expanded={open}
        aria-haspopup="true"
      >
        <BellIcon className="h-5 w-5" />
        {badgeLabel ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-accent-foreground">
            {badgeLabel}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(100vw-2.5rem,22rem)] overflow-hidden rounded-xl border border-border bg-surface shadow-md">
          <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
            <p className="text-sm font-medium text-foreground">Notifications</p>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={isPending}
                className="text-xs font-medium text-accent underline disabled:opacity-60"
              >
                Mark all read
              </button>
            ) : null}
          </div>

          {items.length === 0 ? (
            <div className="bg-surface px-4 py-8 text-center">
              <p className="text-sm font-medium text-foreground">
                No new notifications
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                You’re all caught up.
              </p>
            </div>
          ) : (
            <ul className="max-h-[min(24rem,70vh)] overflow-y-auto bg-surface">
              {items.map((item) => {
                const unread = !item.readAt
                return (
                  <li key={item.id} className="border-b border-border last:border-0">
                    <button
                      type="button"
                      onClick={() => handleNotificationClick(item)}
                      className={`w-full px-4 py-3 text-left transition hover:bg-surface-elevated ${
                        unread ? 'bg-surface-elevated' : 'bg-surface'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p
                          className={`text-sm ${
                            unread
                              ? 'font-semibold text-foreground'
                              : 'font-medium text-foreground'
                          }`}
                        >
                          {item.title}
                        </p>
                        {unread ? (
                          <span
                            className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent"
                            aria-hidden
                          />
                        ) : null}
                      </div>
                      {item.body ? (
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                          {item.body}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs text-muted">
                        {formatNotificationRelativeTime(item.createdAt)}
                      </p>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
