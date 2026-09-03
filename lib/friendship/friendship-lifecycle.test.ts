import { describe, expect, it, vi, beforeEach } from 'vitest'
import { onFriendshipConnectionAdded } from '@/lib/friendship/friendship-lifecycle'

const PAID_BILLING = { subscription_status: 'active', tier: 'inner_circle' }
const EVENT_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_EVENT_ID = '22222222-2222-4222-8222-222222222222'

function makeSupabase(profile: {
  application_status: string | null
  membership_billing?: unknown
  role?: string | null
  curated_matches_pause_reason?: string | null
  connection_intents?: string[] | null
}) {
  const inserts: unknown[] = []
  return {
    _inserts: inserts,
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  connection_intents: profile.connection_intents ?? ['friends'],
                  wants_curated_matches: null,
                  curated_matches_pause_reason:
                    profile.curated_matches_pause_reason ?? null,
                  compatibility_completed_at: null,
                  membership_billing: profile.membership_billing ?? null,
                  role: profile.role ?? null,
                  application_status: profile.application_status,
                },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'membership_entitlement_cycles') {
        const cycleChain = {
          eq: () => cycleChain,
          order: () => cycleChain,
          limit: () => cycleChain,
          maybeSingle: async () => ({ data: null, error: null }),
        }
        return { select: () => cycleChain }
      }
      if (table === 'membership_access_overrides') {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'member_notifications') {
        return {
          insert: (row: unknown) => {
            inserts.push(row)
            return Promise.resolve({ error: null })
          },
        }
      }
      return {}
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('onFriendshipConnectionAdded — feature flag off', () => {
  beforeEach(() => {
    vi.stubEnv('FRIENDSHIP_MATCHING_ENABLED', 'false')
  })

  it('does not create a notification when the flag is off', async () => {
    const supabase = makeSupabase({
      application_status: 'approved',
      membership_billing: PAID_BILLING,
    })
    await onFriendshipConnectionAdded(supabase, 'user-1', EVENT_ID)
    expect(supabase._inserts).toHaveLength(0)
  })
})

describe('onFriendshipConnectionAdded — application_status gate', () => {
  beforeEach(() => {
    vi.stubEnv('FRIENDSHIP_MATCHING_ENABLED', 'true')
  })

  const unapprovedStatuses = [
    'draft',
    'submitted',
    'in_review',
    'needs_info',
    'rejected',
    null,
  ]

  for (const status of unapprovedStatuses) {
    it(`does not create a notification for status=${JSON.stringify(status)}`, async () => {
      const supabase = makeSupabase({
        application_status: status,
        membership_billing: PAID_BILLING,
      })
      await onFriendshipConnectionAdded(supabase, 'user-1', EVENT_ID)
      expect(supabase._inserts).toHaveLength(0)
    })
  }

  it('creates a notification for an approved paid member with an event id', async () => {
    const supabase = makeSupabase({
      application_status: 'approved',
      membership_billing: PAID_BILLING,
    })
    await onFriendshipConnectionAdded(supabase, 'user-1', EVENT_ID)
    expect(supabase._inserts).toHaveLength(1)
  })
})

describe('onFriendshipConnectionAdded — paid entitlement gate', () => {
  beforeEach(() => {
    vi.stubEnv('FRIENDSHIP_MATCHING_ENABLED', 'true')
  })

  it('does not create a notification for an approved but unpaid member', async () => {
    const supabase = makeSupabase({
      application_status: 'approved',
      membership_billing: null,
    })
    await onFriendshipConnectionAdded(supabase, 'user-1', EVENT_ID)
    expect(supabase._inserts).toHaveLength(0)
  })

  it('creates a notification for an approved paid member', async () => {
    const supabase = makeSupabase({
      application_status: 'approved',
      membership_billing: PAID_BILLING,
    })
    await onFriendshipConnectionAdded(supabase, 'user-1', EVENT_ID)
    expect(supabase._inserts).toHaveLength(1)
    expect(supabase._inserts[0]).toMatchObject({
      type: 'friendship_intent_approved',
      href: '/matches/friends',
      metadata: { intent_event_id: EVENT_ID },
    })
  })
})

describe('onFriendshipConnectionAdded — intentEventId gate', () => {
  beforeEach(() => {
    vi.stubEnv('FRIENDSHIP_MATCHING_ENABLED', 'true')
  })

  it('does not notify without an event id, even when approved and paid', async () => {
    const supabase = makeSupabase({
      application_status: 'approved',
      membership_billing: PAID_BILLING,
    })
    await onFriendshipConnectionAdded(supabase, 'user-1')
    expect(supabase._inserts).toHaveLength(0)
  })

  it('a later genuine event id can notify again', async () => {
    const supabase = makeSupabase({
      application_status: 'approved',
      membership_billing: PAID_BILLING,
    })
    await onFriendshipConnectionAdded(supabase, 'user-1', EVENT_ID)
    await onFriendshipConnectionAdded(supabase, 'user-1', OTHER_EVENT_ID)
    expect(supabase._inserts).toHaveLength(2)
    expect(supabase._inserts[0]).toMatchObject({
      metadata: { intent_event_id: EVENT_ID },
    })
    expect(supabase._inserts[1]).toMatchObject({
      metadata: { intent_event_id: OTHER_EVENT_ID },
    })
  })
})

describe('onFriendshipConnectionAdded — notification template', () => {
  beforeEach(() => {
    vi.stubEnv('FRIENDSHIP_MATCHING_ENABLED', 'true')
  })

  it('uses the correct title, body, href, and event metadata', async () => {
    const supabase = makeSupabase({
      application_status: 'approved',
      membership_billing: PAID_BILLING,
    })
    await onFriendshipConnectionAdded(supabase, 'user-1', EVENT_ID)
    expect(supabase._inserts[0]).toMatchObject({
      title: 'Friendship added to profile',
      body: 'Your profile update was approved. You can continue with Matched Friends.',
      href: '/matches/friends',
      metadata: { intent_event_id: EVENT_ID },
    })
  })
})

describe('onFriendshipConnectionAdded — duplicate conflict is a no-op', () => {
  beforeEach(() => {
    vi.stubEnv('FRIENDSHIP_MATCHING_ENABLED', 'true')
  })

  it('does not throw when a unique conflict is returned for the same event id', async () => {
    const inserts: unknown[] = []
    const supabase = {
      _inserts: inserts,
      from: (table: string) => {
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    connection_intents: ['friends'],
                    wants_curated_matches: null,
                    curated_matches_pause_reason: null,
                    compatibility_completed_at: null,
                    membership_billing: PAID_BILLING,
                    role: null,
                    application_status: 'approved',
                  },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'membership_entitlement_cycles') {
          const cycleChain = {
            eq: () => cycleChain,
            order: () => cycleChain,
            limit: () => cycleChain,
            maybeSingle: async () => ({ data: null, error: null }),
          }
          return { select: () => cycleChain }
        }
        if (table === 'membership_access_overrides') {
          return {
            select: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }
        }
        if (table === 'member_notifications') {
          return {
            insert: (row: unknown) => {
              inserts.push(row)
              return Promise.resolve({
                error: {
                  code: '23505',
                  message: 'duplicate key value violates unique constraint',
                },
              })
            },
          }
        }
        return {}
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    await expect(
      onFriendshipConnectionAdded(supabase, 'user-1', EVENT_ID)
    ).resolves.toBeUndefined()
    expect(inserts[0]).toMatchObject({
      metadata: { intent_event_id: EVENT_ID },
    })
  })
})
