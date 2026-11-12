import { describe, expect, it, vi } from 'vitest'
import { AUTH_BAN_DURATION } from '@/lib/member-removal'

const stripeState = vi.hoisted(() => ({
  configured: true,
  cancel: vi.fn(async () => ({})),
}))

vi.mock('@/lib/stripe/config', () => ({
  getStripe: () => ({ subscriptions: { cancel: stripeState.cancel } }),
  isStripeConfigured: () => stripeState.configured,
}))

import {
  banAuthUser,
  cancelRemovedMemberSubscription,
  unbanAuthUser,
} from '@/lib/member-removal-db'

describe('removal Stripe and Auth calls', () => {
  it('cancels an active subscription immediately without proration', async () => {
    stripeState.configured = true
    stripeState.cancel.mockClear()
    const state = await cancelRemovedMemberSubscription({
      tier: 'inner_circle',
      subscription_status: 'active',
      stripe_subscription_id: 'sub_123',
    })
    expect(state).toBe('cancelled')
    expect(stripeState.cancel).toHaveBeenCalledWith('sub_123', {
      prorate: false,
      invoice_now: false,
    })
  })

  it('records a Stripe failure without returning provider details', async () => {
    stripeState.cancel.mockRejectedValueOnce(
      new Error('No such customer cus_secret')
    )
    const state = await cancelRemovedMemberSubscription({
      tier: 'inner_circle',
      subscription_status: 'active',
      stripe_subscription_id: 'sub_123',
    })
    expect(state).toBe('failed')
    expect(JSON.stringify(state)).not.toContain('cus_secret')
  })

  it('bans and lifts Auth without a network call in this test', async () => {
    const updateUserById = vi.fn(async () => ({ data: { user: null }, error: null }))
    const admin = {
      auth: { admin: { updateUserById } },
    } as never
    await expect(banAuthUser(admin, 'member-1')).resolves.toBe('banned')
    expect(updateUserById).toHaveBeenCalledWith('member-1', {
      ban_duration: AUTH_BAN_DURATION,
    })
    await expect(unbanAuthUser(admin, 'member-1')).resolves.toBe('lifted')
    expect(updateUserById).toHaveBeenLastCalledWith('member-1', {
      ban_duration: 'none',
    })
  })
})
