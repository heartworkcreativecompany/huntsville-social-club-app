import { describe, expect, it, vi } from 'vitest'
import {
  markAllNotificationsReadForUser,
  markNotificationReadForUser,
} from '@/lib/notification-read'

function mockReadSupabase() {
  const update = vi.fn(() => ({
    eq: () => ({
      eq: () => ({
        is: async () => ({ error: null }),
      }),
      is: async () => ({ error: null }),
    }),
  }))

  return {
    from: () => ({ update }),
    update,
  } as never
}

describe('markNotificationReadForUser', () => {
  it('updates only the matching unread notification for the user', async () => {
    const supabase = mockReadSupabase()

    const result = await markNotificationReadForUser(
      supabase,
      'user-1',
      'notification-1'
    )

    expect(result).toEqual({ success: true })
    expect(supabase.update).toHaveBeenCalledWith(
      expect.objectContaining({ read_at: expect.any(String) })
    )
  })

  it('treats a missing notifications table as success', async () => {
    const supabase = {
      from: () => ({
        update: () => ({
          eq: () => ({
            eq: () => ({
              is: async () => ({
                error: { code: '42P01', message: 'relation does not exist' },
              }),
            }),
          }),
        }),
      }),
    } as never

    await expect(
      markNotificationReadForUser(supabase, 'user-1', 'notification-1')
    ).resolves.toEqual({ success: true })
  })
})

describe('markAllNotificationsReadForUser', () => {
  it('marks all unread notifications for the user', async () => {
    const supabase = mockReadSupabase()

    const result = await markAllNotificationsReadForUser(supabase, 'user-1')

    expect(result).toEqual({ success: true })
    expect(supabase.update).toHaveBeenCalled()
  })
})
