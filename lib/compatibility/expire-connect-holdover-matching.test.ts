import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CONNECT_HOLDOVER_EXPIRY_CANCELLATION_REASON,
  connectHoldoverExpiryCandidates,
  expireConnectHoldoverMatchingForUser,
} from '@/lib/compatibility/expire-connect-holdover-matching'
import { shouldExpireConnectHoldoverMatching } from '@/lib/membership-entitlements'
import type { EntitlementCycle } from '@/lib/membership-entitlements'
import {
  connectBilling,
  freeMemberBilling,
  innerCircleBilling,
} from '@/lib/friendship/test-fixtures'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => null,
}))

type Filter = [string, string, unknown]

type RecordedWrite = {
  table: string
  method: string
  payload: unknown
  filters: Filter[]
}

function circleCycle(
  tier: 'inner_circle' | 'elite_circle',
  periodEnd: string,
  isActive = true
): EntitlementCycle {
  return {
    id: 'cycle-1',
    product_tier: tier,
    period_start: '2026-08-01T00:00:00.000Z',
    period_end: periodEnd,
    credits_granted: 1,
    credits_used: 0,
    guest_invites_granted: 0,
    guest_invites_used: 0,
    circle_social_credits_granted: 2,
    circle_social_credits_used: 0,
    is_active: isActive,
  }
}

function createWriteRecorder() {
  const writes: RecordedWrite[] = []
  const notifications: unknown[] = []

  function builder(table: string) {
    const filters: Filter[] = []
    let method = 'select'
    let payload: unknown
    const api: Record<string, unknown> = {}

    const record = () => {
      writes.push({ table, method, payload, filters: [...filters] })
    }

    Object.assign(api, {
      select: () => {
        return api
      },
      update: (next: unknown) => {
        method = 'update'
        payload = next
        return api
      },
      insert: (row: unknown) => {
        method = 'insert'
        payload = row
        if (table === 'member_notifications') {
          notifications.push(row)
        }
        record()
        return Promise.resolve({ data: null, error: null })
      },
      eq: (column: string, value: unknown) => {
        filters.push(['eq', column, value])
        return api
      },
      in: (column: string, value: unknown) => {
        filters.push(['in', column, value])
        return api
      },
      lte: (column: string, value: unknown) => {
        filters.push(['lte', column, value])
        return api
      },
      maybeSingle: async () => {
        record()
        return { data: { id: 'cycle-1' }, error: null }
      },
      then: (
        resolve: (value: { data: null; error: null }) => unknown,
        reject?: (reason: unknown) => unknown
      ) => {
        record()
        return Promise.resolve({ data: null, error: null }).then(resolve, reject)
      },
    })

    return api
  }

  return {
    writes,
    notifications,
    from: (table: string) => builder(table),
  }
}

describe('Connect holdover expiry cleanup', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const now = new Date('2026-09-06T17:00:00.000Z')
  const expiredEnd = '2026-09-01T00:00:00.000Z'
  const futureEnd = '2026-10-01T00:00:00.000Z'

  it('selects only Connect members whose leftover Circle cycle has ended', () => {
    const expired = circleCycle('inner_circle', expiredEnd)
    const future = circleCycle('elite_circle', futureEnd)
    const candidates = connectHoldoverExpiryCandidates(
      [
        { userId: 'connect-expired', cycle: expired },
        { userId: 'connect-holdover', cycle: future },
        { userId: 'inner-expired', cycle: expired },
      ],
      [
        {
          id: 'connect-expired',
          role: 'member',
          membership_billing: connectBilling,
          application_status: 'approved',
        },
        {
          id: 'connect-holdover',
          role: 'member',
          membership_billing: connectBilling,
          application_status: 'approved',
        },
        {
          id: 'inner-expired',
          role: 'member',
          membership_billing: innerCircleBilling,
          application_status: 'approved',
        },
        {
          id: 'new-connect',
          role: 'member',
          membership_billing: connectBilling,
          application_status: 'approved',
        },
      ],
      now
    )

    expect(candidates.map((candidate) => candidate.userId)).toEqual([
      'connect-expired',
    ])
    expect(
      shouldExpireConnectHoldoverMatching({
        productTier: 'inner_circle',
        cycle: expired,
        now,
      })
    ).toBe(false)
    expect(
      shouldExpireConnectHoldoverMatching({
        productTier: 'connect',
        cycle: null,
        now,
      })
    ).toBe(false)
    expect(
      shouldExpireConnectHoldoverMatching({
        productTier: 'connect',
        cycle: { ...expired, is_active: false },
        now,
      })
    ).toBe(false)
    expect(
      shouldExpireConnectHoldoverMatching({
        productTier: 'member',
        cycle: expired,
        now,
      })
    ).toBe(false)
  })

  it('expires pending Dating and Friendship recommendations without touching history or messaging', async () => {
    vi.setSystemTime(now)
    const expired = circleCycle('inner_circle', expiredEnd)
    const supabase = createWriteRecorder()

    const first = await expireConnectHoldoverMatchingForUser(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      {
        userId: 'user-1',
        cycle: expired,
        productTier: 'connect',
        now,
      }
    )

    expect(first).toEqual({ cleaned: true, userId: 'user-1' })
    expect(supabase.notifications).toEqual([])
    expect(
      supabase.writes.some((write) => write.table === 'member_notifications')
    ).toBe(false)
    expect(
      supabase.writes.some((write) => write.table === 'profiles')
    ).toBe(false)
    expect(
      supabase.writes.some(
        (write) =>
          write.table === 'conversations' || write.table === 'messages'
      )
    ).toBe(false)
    expect(
      supabase.writes.some(
        (write) =>
          write.table === 'friendship_questionnaires' ||
          write.table === 'profiles' &&
            JSON.stringify(write.payload).includes('compatibility_questionnaire')
      )
    ).toBe(false)

    const datingExpire = supabase.writes.find(
      (write) => write.table === 'curated_match_recommendations'
    )
    expect(datingExpire?.method).toBe('update')
    expect(datingExpire?.payload).toMatchObject({ status: 'expired' })
    expect(datingExpire?.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'user_id', 'user-1'],
        ['in', 'status', ['pending', 'viewed']],
      ])
    )

    const friendshipExpire = supabase.writes.find(
      (write) => write.table === 'friendship_match_recommendations'
    )
    expect(friendshipExpire?.method).toBe('update')
    expect(friendshipExpire?.payload).toMatchObject({ status: 'expired' })
    expect(friendshipExpire?.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'user_id', 'user-1'],
        ['in', 'status', ['pending', 'viewed']],
      ])
    )

    const cancelled = supabase.writes.find(
      (write) => write.table === 'curated_match_batches'
    )
    expect(cancelled?.payload).toMatchObject({
      status: 'cancelled',
      cancellation_reason: CONNECT_HOLDOVER_EXPIRY_CANCELLATION_REASON,
    })

    const deactivated = supabase.writes.find(
      (write) =>
        write.table === 'membership_entitlement_cycles' &&
        write.method === 'update'
    )
    expect(deactivated?.payload).toEqual({ is_active: false })
    expect(deactivated?.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'id', 'cycle-1'],
        ['eq', 'is_active', true],
        ['lte', 'period_end', now.toISOString()],
      ])
    )
  })

  it('is a no-op on a second run after the leftover cycle is deactivated', async () => {
    const expired = circleCycle('inner_circle', expiredEnd, false)
    const supabase = createWriteRecorder()

    const second = await expireConnectHoldoverMatchingForUser(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      {
        userId: 'user-1',
        cycle: expired,
        productTier: 'connect',
        now,
      }
    )

    expect(second).toEqual({ cleaned: false, userId: 'user-1' })
    expect(supabase.writes).toEqual([])
    expect(supabase.notifications).toEqual([])
  })

  it('does not expire matching for Inner Circle, Elite Circle, or a new Connect member', async () => {
    const supabase = createWriteRecorder()
    const innerCycle = circleCycle('inner_circle', futureEnd)
    const inner = await expireConnectHoldoverMatchingForUser(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      {
        userId: 'inner-1',
        cycle: innerCycle,
        productTier: 'inner_circle',
        now,
      }
    )
    const elite = await expireConnectHoldoverMatchingForUser(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      {
        userId: 'elite-1',
        cycle: circleCycle('elite_circle', futureEnd),
        productTier: 'elite_circle',
        now,
      }
    )
    const newConnect = await expireConnectHoldoverMatchingForUser(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      {
        userId: 'connect-1',
        cycle: innerCycle,
        productTier: 'connect',
        now,
      }
    )
    const freeMember = await expireConnectHoldoverMatchingForUser(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      {
        userId: 'member-1',
        cycle: circleCycle('inner_circle', expiredEnd),
        productTier: 'member',
        now,
      }
    )

    expect(inner.cleaned).toBe(false)
    expect(elite.cleaned).toBe(false)
    expect(newConnect.cleaned).toBe(false)
    expect(freeMember.cleaned).toBe(false)
    expect(supabase.writes).toEqual([])
    expect(freeMemberBilling.tier).toBe('member')
  })
})
