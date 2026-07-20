import { describe, expect, it } from 'vitest'
import {
  loadMemberNotificationUnreadCount,
  loadMemberNotifications,
} from '@/lib/load-member-notifications'
import { NOTIFICATION_INBOX_LIMIT } from '@/lib/notification-ui'

function mockSupabaseForNotifications(input: {
  rows?: Array<{
    id: string
    type: string
    title: string
    body: string | null
    href: string
    read_at: string | null
    created_at: string
  }>
  unreadCount?: number
  listError?: { code: string; message: string } | null
  countError?: { code: string; message: string } | null
}) {
  const listBuilder = {
    select: () => listBuilder,
    eq: () => listBuilder,
    order: () => listBuilder,
    limit: async () => ({
      data: input.rows ?? [],
      error: input.listError ?? null,
    }),
  }

  const countBuilder = {
    select: () => countBuilder,
    eq: () => countBuilder,
    is: async () => ({
      count: input.unreadCount ?? 0,
      error: input.countError ?? null,
    }),
  }

  let fromCall = 0

  return {
    from: () => {
      fromCall += 1
      return fromCall === 1 ? listBuilder : countBuilder
    },
  } as never
}

describe('loadMemberNotifications', () => {
  it('returns empty items and zero unread when there are no rows', async () => {
    const result = await loadMemberNotifications(
      mockSupabaseForNotifications({ rows: [], unreadCount: 0 }),
      'user-1'
    )

    expect(result).toEqual({ items: [], unreadCount: 0 })
  })

  it('maps rows and uses the default inbox limit', async () => {
    const supabase = mockSupabaseForNotifications({
      rows: [
        {
          id: 'n-1',
          type: 'new_message',
          title: 'New message',
          body: 'Body',
          href: '/messages/abc',
          read_at: null,
          created_at: '2026-07-07T00:00:00.000Z',
        },
      ],
      unreadCount: 1,
    })

    const result = await loadMemberNotifications(supabase, 'user-1')

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toEqual({
      id: 'n-1',
      type: 'new_message',
      title: 'New message',
      body: 'Body',
      href: '/messages/abc',
      readAt: null,
      createdAt: '2026-07-07T00:00:00.000Z',
    })
    expect(result.unreadCount).toBe(1)
    expect(NOTIFICATION_INBOX_LIMIT).toBe(20)
  })

  it('returns empty state when the notifications table is missing', async () => {
    const result = await loadMemberNotifications(
      mockSupabaseForNotifications({
        listError: { code: '42P01', message: 'relation does not exist' },
      }),
      'user-1'
    )

    expect(result).toEqual({ items: [], unreadCount: 0 })
  })
})

describe('loadMemberNotificationUnreadCount', () => {
  it('returns zero when the table is missing', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            is: async () => ({
              count: null,
              error: { code: '42P01', message: 'relation does not exist' },
            }),
          }),
        }),
      }),
    } as never

    await expect(
      loadMemberNotificationUnreadCount(supabase, 'user-1')
    ).resolves.toBe(0)
  })

  it('returns the unread count from the head query', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            is: async () => ({ count: 12, error: null }),
          }),
        }),
      }),
    } as never

    await expect(
      loadMemberNotificationUnreadCount(supabase, 'user-1')
    ).resolves.toBe(12)
  })
})
