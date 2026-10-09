import { describe, expect, it } from 'vitest'
import {
  memberHasMatchedCuratedIntroConversations,
  resolveMemberMessagingAccess,
} from '@/lib/curated-intro-messaging-access'

describe('resolveMemberMessagingAccess', () => {
  it('allows full messaging members without intro-only mode', async () => {
    const supabase = {
      from: () => {
        throw new Error('should not query')
      },
    } as never

    const access = await resolveMemberMessagingAccess(supabase, {
      userId: 'user-1',
      canMessage: true,
      messagingSuspended: false,
    })

    expect(access).toEqual({
      canAccessInbox: true,
      canAccessConversation: true,
      introOnlyAccess: false,
      adminModeration: false,
    })
  })

  it('does not grant inbox access from a curated intro or an old conversation', async () => {
    const supabase = {
      from: () => {
        throw new Error('should not query intro exceptions')
      },
    } as never

    const access = await resolveMemberMessagingAccess(supabase, {
      userId: 'user-1',
      canMessage: false,
      messagingSuspended: true,
      conversationId: 'conversation-1',
    })

    expect(access).toEqual({
      canAccessInbox: false,
      canAccessConversation: false,
      introOnlyAccess: false,
      adminModeration: false,
    })
  })

  it('keeps admin moderation read access separate from personal messaging', async () => {
    const supabase = {
      from: () => {
        throw new Error('should not query')
      },
    } as never

    const access = await resolveMemberMessagingAccess(supabase, {
      userId: 'admin-1',
      canMessage: false,
      messagingSuspended: false,
      adminModeration: true,
      conversationId: 'conversation-1',
    })

    expect(access.canAccessInbox).toBe(true)
    expect(access.canAccessConversation).toBe(true)
    expect(access.adminModeration).toBe(true)
    expect(access.introOnlyAccess).toBe(false)
  })
})

describe('memberHasMatchedCuratedIntroConversations', () => {
  it('returns false when intro tables are missing', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            not: () => ({
              not: () => ({
                or: () => ({
                  limit: async () => ({ data: null, error: { code: '42P01' } }),
                }),
              }),
            }),
          }),
        }),
      }),
    } as never

    await expect(
      memberHasMatchedCuratedIntroConversations(supabase, 'user-1')
    ).resolves.toBe(false)
  })
})
