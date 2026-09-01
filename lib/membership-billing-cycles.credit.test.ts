import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  consumeCircleSocialCredit,
  consumeEventCredit,
} from '@/lib/membership-billing-cycles'
import { INNER_CIRCLE_SOCIAL_CREDITS_EXHAUSTED_MESSAGE } from '@/lib/membership-pricing-copy'

const { createAdminClientMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(() => null),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClientMock(),
}))

type CycleState = {
  id: string
  credits_granted: number
  credits_used: number
  circle_social_credits_granted?: number | null
  circle_social_credits_used?: number
  is_active: boolean
}

function createCycleClient(options: {
  cycle: CycleState
  /** Simulate RLS: update returns no row */
  blockUpdates?: boolean
}) {
  const state = {
    circle_social_credits_granted: null as number | null,
    circle_social_credits_used: 0,
    ...options.cycle,
  }

  function updateChain(values: Record<string, number>) {
    const filters: Record<string, unknown> = {}
    const chain = {
      eq(column: string, value: unknown) {
        filters[column] = value
        return chain
      },
      select() {
        return {
          maybeSingle: async () => {
            if (options.blockUpdates) {
              return { data: null, error: null }
            }
            if (
              filters.credits_used != null &&
              state.credits_used !== filters.credits_used
            ) {
              return { data: null, error: null }
            }
            if (
              filters.circle_social_credits_used != null &&
              state.circle_social_credits_used !==
                filters.circle_social_credits_used
            ) {
              return { data: null, error: null }
            }
            Object.assign(state, values)
            return {
              data: { ...state },
              error: null,
            }
          },
        }
      },
    }
    return chain
  }

  const client = {
    from(table: string) {
      if (table !== 'membership_entitlement_cycles') {
        throw new Error(`Unexpected table ${table}`)
      }

      return {
        select() {
          const chain = {
            eq() {
              return chain
            },
            single: async () => ({
              data: { ...state },
              error: null,
            }),
          }
          return chain
        },
        update(values: Record<string, number>) {
          return updateChain(values)
        },
      }
    },
  }

  return {
    client: client as never,
    getState: () => ({ ...state }),
  }
}

describe('consumeEventCredit persistence', () => {
  beforeEach(() => {
    createAdminClientMock.mockReturnValue(null)
  })

  it('persists credits_used and returns remaining from the updated row', async () => {
    const { client, getState } = createCycleClient({
      cycle: {
        id: 'cycle-1',
        credits_granted: 2,
        credits_used: 0,
        is_active: true,
      },
    })

    const result = await consumeEventCredit(client, 'cycle-1')

    expect(result).toEqual({
      creditsRemaining: 1,
      creditsGranted: 2,
      creditsUsed: 1,
    })
    expect(getState().credits_used).toBe(1)
  })

  it('throws when an update silently affects 0 rows (RLS no-op)', async () => {
    const { client, getState } = createCycleClient({
      cycle: {
        id: 'cycle-1',
        credits_granted: 2,
        credits_used: 0,
        is_active: true,
      },
      blockUpdates: true,
    })

    await expect(consumeEventCredit(client, 'cycle-1')).rejects.toThrow(
      /did not persist/i
    )
    expect(getState().credits_used).toBe(0)
  })
})

describe('Elite credit RSVP result snapshot contract', () => {
  it('builds a 1-of-2 perks payload from a durable consume result', async () => {
    const { client, getState } = createCycleClient({
      cycle: {
        id: 'cycle-elite',
        credits_granted: 2,
        credits_used: 0,
        is_active: true,
      },
    })

    const consumed = await consumeEventCredit(client, 'cycle-elite')
    expect(getState().credits_used).toBe(1)

    const perks = {
      productTier: 'elite_circle' as const,
      hasPaidMembership: true as const,
      premiumCreditsRemaining: consumed.creditsRemaining,
      creditsGranted: consumed.creditsGranted,
      guestInvitesRemaining: 1,
      periodStart: '2026-08-01T00:00:00.000Z',
      periodEnd: '2026-09-01T00:00:00.000Z',
    }

    expect(consumed.creditsRemaining).toBe(1)
    expect(perks.premiumCreditsRemaining).toBe(1)
    expect(perks.creditsGranted).toBe(2)

    const freshRemaining = Math.max(
      0,
      getState().credits_granted - getState().credits_used
    )
    expect(freshRemaining).toBe(1)
  })
})

describe('consumeCircleSocialCredit', () => {
  beforeEach(() => {
    createAdminClientMock.mockReturnValue(null)
  })

  it('consumes exactly one Inner Circle Circle Social credit', async () => {
    const { client, getState } = createCycleClient({
      cycle: {
        id: 'cycle-inner',
        credits_granted: 1,
        credits_used: 0,
        circle_social_credits_granted: 2,
        circle_social_credits_used: 0,
        is_active: true,
      },
    })

    const result = await consumeCircleSocialCredit(client, 'cycle-inner')
    expect(result).toEqual({
      creditsRemaining: 1,
      creditsGranted: 2,
      creditsUsed: 1,
    })
    expect(getState().circle_social_credits_used).toBe(1)
    expect(getState().credits_used).toBe(0)
  })

  it('denies a third included Circle Social credit without consuming another', async () => {
    const { client, getState } = createCycleClient({
      cycle: {
        id: 'cycle-inner',
        credits_granted: 1,
        credits_used: 0,
        circle_social_credits_granted: 2,
        circle_social_credits_used: 2,
        is_active: true,
      },
    })

    await expect(consumeCircleSocialCredit(client, 'cycle-inner')).rejects.toThrow(
      INNER_CIRCLE_SOCIAL_CREDITS_EXHAUSTED_MESSAGE
    )
    expect(getState().circle_social_credits_used).toBe(2)
  })

  it('does not let a stale CAS retry consume two credits for one remaining slot', async () => {
    const { client, getState } = createCycleClient({
      cycle: {
        id: 'cycle-inner',
        credits_granted: 1,
        credits_used: 0,
        circle_social_credits_granted: 2,
        circle_social_credits_used: 1,
        is_active: true,
      },
    })

    const first = await consumeCircleSocialCredit(client, 'cycle-inner')
    expect(first.creditsRemaining).toBe(0)
    await expect(consumeCircleSocialCredit(client, 'cycle-inner')).rejects.toThrow(
      INNER_CIRCLE_SOCIAL_CREDITS_EXHAUSTED_MESSAGE
    )
    expect(getState().circle_social_credits_used).toBe(2)
  })
})
