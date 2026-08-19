import { describe, expect, it, vi } from 'vitest'
import {
  authDisplayNameMetadata,
  emptyAuthDisplayNameBackfillCounts,
  normalizePublicFacingName,
  recordAuthDisplayNameBackfillResult,
  shouldSyncAuthDisplayName,
} from '@/lib/auth-display-name'
import {
  backfillAuthDisplayNames,
  syncAuthDisplayNameFromProfile,
} from '@/lib/sync-auth-display-name'
import { profileColumnsFromDraft } from '@/lib/application-draft-sync'
import { emptyDraft } from '@/lib/application'

describe('auth display name helpers', () => {
  it('normalizes public-facing names and rejects blanks', () => {
    expect(normalizePublicFacingName('  Alex Rivera  ')).toBe('Alex Rivera')
    expect(normalizePublicFacingName('')).toBeNull()
    expect(normalizePublicFacingName('   ')).toBeNull()
    expect(normalizePublicFacingName(null)).toBeNull()
  })

  it('builds Auth metadata from the public-facing name only', () => {
    expect(authDisplayNameMetadata('Jordan Lee')).toEqual({
      display_name: 'Jordan Lee',
      full_name: 'Jordan Lee',
    })
  })

  it('skips idempotent repeat updates when metadata already matches', () => {
    expect(
      shouldSyncAuthDisplayName({
        publicFacingName: 'Alex',
        existingDisplayName: 'Alex',
        existingFullName: 'Alex',
      })
    ).toBe(false)

    expect(
      shouldSyncAuthDisplayName({
        publicFacingName: 'Alex',
        existingDisplayName: null,
        existingFullName: null,
      })
    ).toBe(true)

    expect(
      shouldSyncAuthDisplayName({
        publicFacingName: null,
        existingDisplayName: null,
        existingFullName: null,
      })
    ).toBe(false)
  })

  it('uses profiles.full_name from draft displayName as the canonical field', () => {
    const draft = emptyDraft()
    draft.profile.displayName = 'Casey Mills'
    expect(profileColumnsFromDraft(draft).full_name).toBe('Casey Mills')
  })
})

function mockAdmin(input: {
  profiles: { id: string; full_name: string | null }[]
  users: Record<
    string,
    { user_metadata?: { display_name?: string; full_name?: string } }
  >
}) {
  const updateUserById = vi.fn(async (userId: string, payload: unknown) => {
    const meta = (payload as { user_metadata: { display_name: string } })
      .user_metadata
    input.users[userId] = {
      user_metadata: {
        display_name: meta.display_name,
        full_name: meta.display_name,
      },
    }
    return { data: { user: input.users[userId] }, error: null }
  })

  const getUserById = vi.fn(async (userId: string) => {
    const user = input.users[userId]
    if (!user) {
      return { data: { user: null }, error: { message: 'not_found' } }
    }
    return { data: { user: { id: userId, ...user } }, error: null }
  })

  return {
    auth: { admin: { getUserById, updateUserById } },
    from: (table: string) => {
      expect(table).toBe('profiles')
      return {
        select: () => ({
          order: () => ({
            range: async () => ({
              data: input.profiles,
              error: null,
            }),
          }),
        }),
      }
    },
    __spies: { getUserById, updateUserById },
  }
}

describe('syncAuthDisplayNameFromProfile', () => {
  it('updates Auth metadata on creation-style sync when name exists', async () => {
    const admin = mockAdmin({
      profiles: [],
      users: {
        user_1: { user_metadata: {} },
      },
    })

    const result = await syncAuthDisplayNameFromProfile({
      userId: 'user_1',
      publicFacingName: 'Alex Rivera',
      admin: admin as never,
    })

    expect(result).toEqual({ ok: true, updated: true })
    expect(admin.__spies.updateUserById).toHaveBeenCalledWith('user_1', {
      user_metadata: {
        display_name: 'Alex Rivera',
        full_name: 'Alex Rivera',
      },
    })
  })

  it('skips when public-facing name is missing', async () => {
    const admin = mockAdmin({
      profiles: [],
      users: { user_1: { user_metadata: {} } },
    })

    const result = await syncAuthDisplayNameFromProfile({
      userId: 'user_1',
      publicFacingName: '   ',
      admin: admin as never,
    })

    expect(result).toEqual({ ok: false, skipped: true })
    expect(admin.__spies.updateUserById).not.toHaveBeenCalled()
  })

  it('is idempotent when Auth already has the same display name', async () => {
    const admin = mockAdmin({
      profiles: [],
      users: {
        user_1: {
          user_metadata: {
            display_name: 'Alex Rivera',
            full_name: 'Alex Rivera',
          },
        },
      },
    })

    const result = await syncAuthDisplayNameFromProfile({
      userId: 'user_1',
      publicFacingName: 'Alex Rivera',
      admin: admin as never,
    })

    expect(result).toEqual({ ok: true, updated: false })
    expect(admin.__spies.updateUserById).not.toHaveBeenCalled()
  })

  it('updates when the public-facing name changes (profile edit / approval path)', async () => {
    const admin = mockAdmin({
      profiles: [],
      users: {
        user_1: {
          user_metadata: {
            display_name: 'Old Name',
            full_name: 'Old Name',
          },
        },
      },
    })

    const result = await syncAuthDisplayNameFromProfile({
      userId: 'user_1',
      publicFacingName: 'New Public Name',
      admin: admin as never,
    })

    expect(result).toEqual({ ok: true, updated: true })
    expect(admin.__spies.updateUserById).toHaveBeenCalledWith('user_1', {
      user_metadata: {
        display_name: 'New Public Name',
        full_name: 'New Public Name',
      },
    })
  })
})

describe('backfillAuthDisplayNames', () => {
  it('reports updated, skipped, and failed counts without requiring name logs', async () => {
    const admin = mockAdmin({
      profiles: [
        { id: 'a', full_name: 'Alex' },
        { id: 'b', full_name: null },
        { id: 'c', full_name: 'Casey' },
        { id: 'missing', full_name: 'Ghost' },
      ],
      users: {
        a: { user_metadata: {} },
        c: {
          user_metadata: { display_name: 'Casey', full_name: 'Casey' },
        },
      },
    })

    const counts = await backfillAuthDisplayNames({
      admin: admin as never,
      pageSize: 50,
    })

    expect(counts).toEqual({
      updated: 1, // a
      skipped: 2, // b blank + c already synced
      failed: 1, // missing auth user
    })
    expect(emptyAuthDisplayNameBackfillCounts()).toEqual({
      updated: 0,
      skipped: 0,
      failed: 0,
    })
    expect(
      recordAuthDisplayNameBackfillResult(
        { updated: 1, skipped: 0, failed: 0 },
        'skipped'
      )
    ).toEqual({ updated: 1, skipped: 1, failed: 0 })
  })

  it('matches only through stored profile auth user ids', async () => {
    const admin = mockAdmin({
      profiles: [{ id: 'auth_user_uuid', full_name: 'Pat' }],
      users: { auth_user_uuid: { user_metadata: {} } },
    })

    await backfillAuthDisplayNames({ admin: admin as never })
    expect(admin.__spies.getUserById).toHaveBeenCalledWith('auth_user_uuid')
    expect(admin.__spies.updateUserById).toHaveBeenCalledWith(
      'auth_user_uuid',
      expect.any(Object)
    )
  })
})
