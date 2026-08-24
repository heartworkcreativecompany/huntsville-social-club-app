import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import NotificationsBell from '@/components/shell/notifications-bell'
import { NOTIFICATION_PANEL_CLASS_NAME } from '@/lib/notification-ui'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: () => undefined,
    refresh: () => undefined,
  }),
}))

vi.mock('@/app/(club)/notifications/actions', () => ({
  markNotificationRead: async () => undefined,
  markAllNotificationsRead: async () => ({ success: true }),
}))

describe('NotificationsBell panel', () => {
  it('renders the left-anchored responsive panel when open', () => {
    const html = renderToStaticMarkup(
      createElement(NotificationsBell, {
        items: [],
        unreadCount: 0,
        open: true,
      })
    )

    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('aria-haspopup="true"')
    expect(html).toContain('aria-label="Notifications"')
    expect(html).toContain(NOTIFICATION_PANEL_CLASS_NAME)
    expect(html).toContain('left-0')
    expect(html).toContain('lg:right-0')
    expect(html).toContain('w-[min(22rem,calc(100vw-2rem))]')
    expect(html).not.toMatch(/class="absolute right-0/)
  })

  it('keeps the trigger accessible when the panel is closed', () => {
    const html = renderToStaticMarkup(
      createElement(NotificationsBell, {
        items: [],
        unreadCount: 3,
        open: false,
      })
    )

    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-label="Notifications, 3 unread"')
    expect(html).not.toContain('>Notifications</p>')
  })

  it('still lists notification titles and mark-all-read when open', () => {
    const html = renderToStaticMarkup(
      createElement(NotificationsBell, {
        items: [
          {
            id: 'n1',
            type: 'message',
            title: 'New message',
            body: 'Hello',
            href: '/messages/1',
            readAt: null,
            createdAt: '2026-08-23T00:00:00.000Z',
          },
        ],
        unreadCount: 1,
        open: true,
      })
    )

    expect(html).toContain('New message')
    expect(html).toContain('Mark all read')
    expect(html).toContain('Hello')
  })
})
