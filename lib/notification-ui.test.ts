import { describe, expect, it } from 'vitest'
import {
  NOTIFICATION_PANEL_CLASS_NAME,
  notificationUnreadBadgeLabel,
} from '@/lib/notification-ui'

describe('notificationUnreadBadgeLabel', () => {
  it('returns null for zero or negative counts', () => {
    expect(notificationUnreadBadgeLabel(0)).toBeNull()
    expect(notificationUnreadBadgeLabel(-1)).toBeNull()
  })

  it('returns the exact count for single-digit unread totals', () => {
    expect(notificationUnreadBadgeLabel(1)).toBe('1')
    expect(notificationUnreadBadgeLabel(9)).toBe('9')
  })

  it('caps the badge label at 9+', () => {
    expect(notificationUnreadBadgeLabel(10)).toBe('9+')
    expect(notificationUnreadBadgeLabel(42)).toBe('9+')
  })
})

describe('notification panel positioning', () => {
  it('left-anchors below lg with a viewport-safe width', () => {
    expect(NOTIFICATION_PANEL_CLASS_NAME).toContain('left-0')
    expect(NOTIFICATION_PANEL_CLASS_NAME).toContain('right-auto')
    expect(NOTIFICATION_PANEL_CLASS_NAME).toContain(
      'w-[min(22rem,calc(100vw-2rem))]'
    )
    expect(NOTIFICATION_PANEL_CLASS_NAME).toContain('z-[60]')
    expect(NOTIFICATION_PANEL_CLASS_NAME).not.toMatch(
      /(?:^|\s)right-0(?:\s|$)/
    )
  })

  it('keeps right-anchored desktop positioning at lg', () => {
    expect(NOTIFICATION_PANEL_CLASS_NAME).toContain('lg:left-auto')
    expect(NOTIFICATION_PANEL_CLASS_NAME).toContain('lg:right-0')
    expect(NOTIFICATION_PANEL_CLASS_NAME).toContain(
      'lg:w-[min(100vw-2.5rem,22rem)]'
    )
  })

  it('fits inside a 320px viewport with 16px side gutters', () => {
    const viewportWidth = 320
    const gutter = 32
    const rem = 16
    const maxWidth = Math.min(22 * rem, viewportWidth - gutter)
    expect(maxWidth).toBe(288)
    expect(maxWidth).toBeLessThanOrEqual(viewportWidth - gutter)
  })
})
