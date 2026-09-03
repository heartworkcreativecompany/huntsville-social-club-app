import { describe, expect, it, vi, beforeEach } from 'vitest'
import { queueAutoGenerateCuratedMatches } from '@/lib/compatibility/auto-generate-matches'
import { onDatingConnectionAdded } from '@/lib/compatibility/dating-lifecycle'

vi.mock('@/lib/compatibility/auto-generate-matches', () => ({
  queueAutoGenerateCuratedMatches: vi.fn(),
}))

vi.mock('@/lib/compatibility/revalidate-curated-match-routes', () => ({
  revalidateCuratedMatchMemberRoutes: vi.fn(),
}))

const PAID_BILLING = { subscription_status: 'active', tier: 'inner_circle' }
const EVENT_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_EVENT_ID = '22222222-2222-4222-8222-222222222222'

function makeSupabase(profile: {
  application_status: string | null
  membership_billing?: unknown
  role?: string | null
  curated_matches_pause_reason?: string | null
  connection_intents?: string[] | null
  wants_curated_matches?: boolean | null
  compatibility_completed_at?: string | null
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
                  connection_intents: profile.connection_intents ?? ['dating'],
                  wants_curated_matches: profile.wants_curated_matches ?? null,
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
          update: () => ({ eq: async () => ({ error: null }) }),
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

describe('onDatingConnectionAdded — feature flag off', () => {
  beforeEach(() => {
    vi.stubEnv('COMPATIBILITY_MATCHING_ENABLED', 'false')
  })

  it('does not create a notification when the flag is off', async () => {
    const supabase = makeSupabase({
      application_status: 'approved',
      membership_billing: PAID_BILLING,
    })
    await onDatingConnectionAdded(supabase, 'user-1', EVENT_ID)
    expect(supabase._inserts).toHaveLength(0)
  })
})

describe('onDatingConnectionAdded — application_status gate', () => {
  beforeEach(() => {
    vi.stubEnv('COMPATIBILITY_MATCHING_ENABLED', 'true')
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
      await onDatingConnectionAdded(supabase, 'user-1', EVENT_ID)
      expect(supabase._inserts).toHaveLength(0)
    })
  }

  it('creates a notification for an approved paid member with an event id', async () => {
    const supabase = makeSupabase({
      application_status: 'approved',
      membership_billing: PAID_BILLING,
    })
    await onDatingConnectionAdded(supabase, 'user-1', EVENT_ID)
    expect(supabase._inserts).toHaveLength(1)
  })
})

describe('onDatingConnectionAdded — paid entitlement gate', () => {
  beforeEach(() => {
    vi.stubEnv('COMPATIBILITY_MATCHING_ENABLED', 'true')
  })

  it('does not create a notification for an approved but unpaid member', async () => {
    const supabase = makeSupabase({
      application_status: 'approved',
      membership_billing: null,
    })
    await onDatingConnectionAdded(supabase, 'user-1', EVENT_ID)
    expect(supabase._inserts).toHaveLength(0)
  })

  it('creates a notification for an approved paid member', async () => {
    const supabase = makeSupabase({
      application_status: 'approved',
      membership_billing: PAID_BILLING,
    })
    await onDatingConnectionAdded(supabase, 'user-1', EVENT_ID)
    expect(supabase._inserts).toHaveLength(1)
    expect(supabase._inserts[0]).toMatchObject({
      type: 'dating_intent_approved',
      href: '/matches/dating',
      metadata: { intent_event_id: EVENT_ID },
    })
  })
})

describe('onDatingConnectionAdded — intentEventId gate', () => {
  beforeEach(() => {
    vi.stubEnv('COMPATIBILITY_MATCHING_ENABLED', 'true')
  })

  it('does not notify without an event id, even when approved and paid', async () => {
    const supabase = makeSupabase({
      application_status: 'approved',
      membership_billing: PAID_BILLING,
    })
    await onDatingConnectionAdded(supabase, 'user-1')
    expect(supabase._inserts).toHaveLength(0)
    expect(queueAutoGenerateCuratedMatches).toHaveBeenCalled()
  })

  it('does not notify for a blank event id', async () => {
    const supabase = makeSupabase({
      application_status: 'approved',
      membership_billing: PAID_BILLING,
    })
    await onDatingConnectionAdded(supabase, 'user-1', '   ')
    expect(supabase._inserts).toHaveLength(0)
  })

  it('a later genuine event id can notify again', async () => {
    const supabase = makeSupabase({
      application_status: 'approved',
      membership_billing: PAID_BILLING,
    })
    await onDatingConnectionAdded(supabase, 'user-1', EVENT_ID)
    await onDatingConnectionAdded(supabase, 'user-1', OTHER_EVENT_ID)
    expect(supabase._inserts).toHaveLength(2)
    expect(supabase._inserts[0]).toMatchObject({
      metadata: { intent_event_id: EVENT_ID },
    })
    expect(supabase._inserts[1]).toMatchObject({
      metadata: { intent_event_id: OTHER_EVENT_ID },
    })
  })
})

describe('onDatingConnectionAdded — notification template', () => {
  beforeEach(() => {
    vi.stubEnv('COMPATIBILITY_MATCHING_ENABLED', 'true')
  })

  it('uses the correct title, body, href, and event metadata', async () => {
    const supabase = makeSupabase({
      application_status: 'approved',
      membership_billing: PAID_BILLING,
    })
    await onDatingConnectionAdded(supabase, 'user-1', EVENT_ID)
    expect(supabase._inserts[0]).toMatchObject({
      title: 'Dating added to profile',
      body: 'Your profile update was approved. You can continue with Dating Matches.',
      href: '/matches/dating',
      metadata: { intent_event_id: EVENT_ID },
    })
  })
})

describe('onDatingConnectionAdded — duplicate conflict is a no-op', () => {
  beforeEach(() => {
    vi.stubEnv('COMPATIBILITY_MATCHING_ENABLED', 'true')
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
                    connection_intents: ['dating'],
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
            update: () => ({ eq: async () => ({ error: null }) }),
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
      onDatingConnectionAdded(supabase, 'user-1', EVENT_ID)
    ).resolves.toBeUndefined()
    expect(inserts[0]).toMatchObject({
      metadata: { intent_event_id: EVENT_ID },
    })
  })
})
