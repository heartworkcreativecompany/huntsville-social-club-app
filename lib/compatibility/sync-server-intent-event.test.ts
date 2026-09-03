import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { onDatingConnectionAdded } from '@/lib/compatibility/dating-lifecycle'
import { onFriendshipConnectionAdded } from '@/lib/friendship/friendship-lifecycle'

vi.mock('@/lib/compatibility/auto-generate-matches', () => ({
  queueAutoGenerateCuratedMatches: vi.fn(),
}))

vi.mock('@/lib/compatibility/revalidate-curated-match-routes', () => ({
  revalidateCuratedMatchMemberRoutes: vi.fn(),
}))

const repoRoot = join(__dirname, '..', '..')

function source(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), 'utf8')
}

const PAID_BILLING = { subscription_status: 'active', tier: 'inner_circle' }
const EVENT_ID = '11111111-1111-4111-8111-111111111111'

function makeSupabase() {
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
                  connection_intents: ['dating', 'friends'],
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
            return Promise.resolve({ error: null })
          },
        }
      }
      return {}
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('intent-approved notification call chain', () => {
  it('mints intentEventId at profile revision submit, not at approval', () => {
    const submit = source('app/(club)/members/actions.ts')
    expect(submit).toContain('intentEventId: crypto.randomUUID()')

    const approve = source('app/(club)/admin/profile-revisions/actions.ts')
    expect(approve).toContain('pending.intentEventId')
    expect(approve).not.toContain('crypto.randomUUID()')
  })

  it('application draft and submit never pass an intent event id', () => {
    const application = source('app/(club)/application/actions.ts')
    expect(application).toContain('runCompatibilityConnectionsLifecycle(')
    expect(application).not.toContain('intentEventId')
    expect(application).toMatch(
      /runCompatibilityConnectionsLifecycle\(\s*user\.id,\s*previousIntents,\s*columns\.connection_intents\s*\)/
    )
  })

  it('only profile-revision approval threads pending.intentEventId', () => {
    const approve = source('app/(club)/admin/profile-revisions/actions.ts')
    expect(approve).toMatch(
      /runCompatibilityConnectionsLifecycle\(\s*memberId,\s*previousIntents,\s*liveColumns\.connection_intents,\s*pending\.intentEventId\s*\)/
    )

    const sync = source('lib/compatibility/sync-server.ts')
    expect(sync).toContain('intentEventId?: string | null')
    expect(sync).toContain('onDatingConnectionAdded(admin, userId, eventId)')
    expect(sync).toContain('onFriendshipConnectionAdded(admin, userId, eventId)')
  })
})

describe('same revision adding both intents', () => {
  beforeEach(() => {
    vi.stubEnv('COMPATIBILITY_MATCHING_ENABLED', 'true')
    vi.stubEnv('FRIENDSHIP_MATCHING_ENABLED', 'true')
  })

  it('creates one dating and one friendship notification with the same event id', async () => {
    const supabase = makeSupabase()
    await onDatingConnectionAdded(supabase, 'user-1', EVENT_ID)
    await onFriendshipConnectionAdded(supabase, 'user-1', EVENT_ID)

    expect(supabase._inserts).toHaveLength(2)
    expect(supabase._inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'dating_intent_approved',
          metadata: { intent_event_id: EVENT_ID },
        }),
        expect.objectContaining({
          type: 'friendship_intent_approved',
          metadata: { intent_event_id: EVENT_ID },
        }),
      ])
    )
  })
})
