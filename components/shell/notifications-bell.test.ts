import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import NotificationsBell from '@/components/shell/notifications-bell'
import { isSafeInAppHref, NOTIFICATION_PANEL_CLASS_NAME } from '@/lib/notification-ui'

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
    expect(html).toContain(
      'w-[min(22rem,calc(100vw-2rem-env(safe-area-inset-left,0px)-env(safe-area-inset-right,0px)))]'
    )
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

describe('isSafeInAppHref — safe href validation', () => {
  it('accepts a normal internal path', () => {
    expect(isSafeInAppHref('/messages')).toBe(true)
    expect(isSafeInAppHref('/matches/dating')).toBe(true)
    expect(isSafeInAppHref('/matches/friends')).toBe(true)
    expect(isSafeInAppHref('/profile')).toBe(true)
    expect(isSafeInAppHref('/messages/some-id')).toBe(true)
  })

  it('rejects protocol-relative URLs (//) ', () => {
    expect(isSafeInAppHref('//evil.com')).toBe(false)
    expect(isSafeInAppHref('//example.com/path')).toBe(false)
  })

  it('rejects external http/https URLs', () => {
    expect(isSafeInAppHref('https://evil.com')).toBe(false)
    expect(isSafeInAppHref('http://example.com')).toBe(false)
  })

  it('rejects other protocol URLs', () => {
    expect(isSafeInAppHref('javascript:alert(1)')).toBe(false)
    expect(isSafeInAppHref('data:text/html,<h1>x</h1>')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isSafeInAppHref('')).toBe(false)
  })

  it('rejects null and undefined', () => {
    expect(isSafeInAppHref(null)).toBe(false)
    expect(isSafeInAppHref(undefined)).toBe(false)
  })
})

describe('NotificationsBell — Mark all read UI', () => {
  it('renders the error message slot (no error = no error text)', () => {
    const html = renderToStaticMarkup(
      createElement(NotificationsBell, {
        items: [
          {
            id: 'n1',
            type: 'new_message',
            title: 'New message',
            body: null,
            href: '/messages/1',
            readAt: null,
            createdAt: '2026-08-23T00:00:00.000Z',
          },
        ],
        unreadCount: 1,
        open: true,
      })
    )

    expect(html).toContain('Mark all read')
    expect(html).not.toContain('Could not mark notifications as read')
  })

  it('does not render the error message when unreadCount is 0', () => {
    const html = renderToStaticMarkup(
      createElement(NotificationsBell, {
        items: [],
        unreadCount: 0,
        open: true,
      })
    )

    expect(html).not.toContain('Mark all read')
    expect(html).not.toContain('Could not mark notifications as read')
  })
})

describe('NotificationsBell — click and mark-all source contracts', () => {
  const source = readFileSync(
    join(__dirname, 'notifications-bell.tsx'),
    'utf8'
  )

  it('validates href with isSafeInAppHref and only pushes a safe internal path', () => {
    expect(source).toContain('isSafeInAppHref(notification.href)')
    expect(source).toContain('if (safeHref) {')
    expect(source).toContain('router.push(safeHref)')
    expect(source).not.toContain('router.push(notification.href)')
  })

  it('does not refresh the router on Mark all read success, and shows the approved error on failure', () => {
    const markAllFn = source.slice(
      source.indexOf('const handleMarkAllRead'),
      source.indexOf('const badgeLabel')
    )
    const withoutComments = markAllFn.replace(/\/\/.*$/gm, '')
    expect(withoutComments).not.toContain('router.refresh()')
    expect(markAllFn).toContain("setMarkAllError('Could not mark notifications as read. Please try again.')")
    expect(markAllFn).toContain("if ('success' in result)")
    expect(markAllFn).toContain('setUnreadCount(0)')
  })
})
