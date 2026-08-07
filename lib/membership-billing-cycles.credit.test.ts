import { beforeEach, describe, expect, it, vi } from 'vitest'
import { consumeEventCredit } from '@/lib/membership-billing-cycles'

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
  is_active: boolean
}

function createCycleClient(options: {
  cycle: CycleState
  /** Simulate RLS: update returns no row */
  blockUpdates?: boolean
}) {
  const state = { ...options.cycle }

  const client = {
    from(table: string) {
      if (table !== 'membership_entitlement_cycles') {
        throw new Error(`Unexpected table ${table}`)
      }

      return {
        select() {
          return {
            eq() {
              return {
                single: async () => ({
                  data: { ...state },
                  error: null,
                }),
              }
            },
          }
        },
        update(values: { credits_used: number }) {
          return {
            eq() {
              return {
                eq() {
                  return {
                    select() {
                      return {
                        maybeSingle: async () => {
                          if (options.blockUpdates) {
                            return { data: null, error: null }
                          }
                          state.credits_used = values.credits_used
                          return {
                            data: {
                              id: state.id,
                              credits_granted: state.credits_granted,
                              credits_used: state.credits_used,
                            },
                            error: null,
                          }
                        },
                      }
                    },
                  }
                },
              }
            },
          }
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

    // Fresh read of the same authoritative row still shows 1 remaining.
    const freshRemaining = Math.max(
      0,
      getState().credits_granted - getState().credits_used
    )
    expect(freshRemaining).toBe(1)
  })
})
