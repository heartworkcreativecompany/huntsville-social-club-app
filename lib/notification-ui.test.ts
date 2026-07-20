import { describe, expect, it } from 'vitest'
import { notificationUnreadBadgeLabel } from '@/lib/notification-ui'

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
