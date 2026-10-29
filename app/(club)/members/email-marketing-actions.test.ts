import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { userRpc, adminRpc, lookup, revalidatePath, state } = vi.hoisted(() => ({
  userRpc: vi.fn(),
  adminRpc: vi.fn(),
  lookup: vi.fn(),
  revalidatePath: vi.fn(),
  state: {
    userId: '11111111-1111-4111-8111-111111111111' as string | null,
    email: 'person@example.com' as string | null,
    admin: true,
    locallyOn: false,
    readError: false,
  },
}))

vi.mock('next/cache', () => ({
  revalidatePath,
}))

vi.mock('@/lib/email-marketing-provider-lookup', () => ({
  lookupMarketingProviderContact: lookup,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => (state.admin ? { rpc: adminRpc } : null),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: {
          user: state.userId ? { id: state.userId, email: state.email } : null,
        },
      }),
    },
    rpc: userRpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: state.readError
              ? null
              : {
                  email_marketing_opt_in: state.locallyOn,
                  email_marketing_opted_out_at: state.locallyOn
                    ? null
                    : '2026-01-01T00:00:00.000Z',
                },
            error: state.readError ? { message: 'read failed' } : null,
          }),
        }),
      }),
    }),
  }),
}))

import { saveEmailMarketingPreference } from '@/app/(club)/members/email-marketing-actions'
import { EMAIL_MARKETING_PREFERENCE_SAVE_ERROR } from '@/lib/email-marketing-preference'

describe('saveEmailMarketingPreference', () => {
  beforeEach(() => {
    state.userId = '11111111-1111-4111-8111-111111111111'
    state.email = 'person@example.com'
    state.admin = true
    state.locallyOn = false
    state.readError = false
    userRpc.mockReset()
    adminRpc.mockReset()
    lookup.mockReset()
    revalidatePath.mockReset()
    userRpc.mockResolvedValue({ data: 'opted_out', error: null })
    adminRpc.mockResolvedValue({ data: 'opted_in', error: null })
    lookup.mockResolvedValue('subscribed')
  })

  it('opts the signed-in member out without a provider lookup or another member id', async () => {
    await expect(saveEmailMarketingPreference(false)).resolves.toEqual({ success: true })
    expect(lookup).not.toHaveBeenCalled()
    expect(adminRpc).not.toHaveBeenCalled()
    expect(userRpc).toHaveBeenCalledWith('set_own_email_marketing_preference', {
      opt_in: false,
    })
    expect(JSON.stringify(userRpc.mock.calls)).not.toContain(state.userId)
    expect(revalidatePath).toHaveBeenCalledWith('/profile')
  })

  it('commits opt-in only for the authenticated member after the provider lookup', async () => {
    await expect(saveEmailMarketingPreference(true)).resolves.toEqual({ success: true })
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(lookup.mock.calls[0]?.[0]).toMatchObject({ email: 'person@example.com' })
    expect(userRpc).not.toHaveBeenCalled()
    expect(adminRpc).toHaveBeenCalledWith('commit_email_marketing_opt_in', {
      target_id: state.userId,
      checked_at: expect.any(String),
    })
    expect(revalidatePath).toHaveBeenCalledWith('/profile')
  })

  it('rejects a signed-out caller before any preference or provider call', async () => {
    state.userId = null
    const result = await saveEmailMarketingPreference(true)
    expect(result).toEqual({ error: 'You must be signed in.' })
    expect(lookup).not.toHaveBeenCalled()
    expect(userRpc).not.toHaveBeenCalled()
    expect(adminRpc).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('returns the blocked result and does not commit when the provider is unsubscribed', async () => {
    lookup.mockResolvedValue('unsubscribed')
    state.locallyOn = true
    const result = await saveEmailMarketingPreference(true)
    expect(result).toEqual({ status: 'blocked_resubscription' })
    expect(result).not.toHaveProperty('success')
    expect(adminRpc).not.toHaveBeenCalled()
    expect(userRpc).toHaveBeenCalledWith('set_own_email_marketing_preference', {
      opt_in: false,
    })
    expect(revalidatePath).toHaveBeenCalledWith('/profile')
  })

  it('does not change the preference when the provider lookup is unavailable', async () => {
    lookup.mockRejectedValue(new Error('timeout'))
    const result = await saveEmailMarketingPreference(true)
    expect(result).toEqual({ status: 'unavailable' })
    expect(result).not.toHaveProperty('success')
    expect(userRpc).not.toHaveBeenCalled()
    expect(adminRpc).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('does not report success when the authoritative save fails', async () => {
    userRpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    const optedOut = await saveEmailMarketingPreference(false)
    adminRpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    const optedIn = await saveEmailMarketingPreference(true)
    expect(optedOut).toEqual({ error: EMAIL_MARKETING_PREFERENCE_SAVE_ERROR })
    expect(optedIn).toEqual({ error: EMAIL_MARKETING_PREFERENCE_SAVE_ERROR })
    expect(optedOut).not.toHaveProperty('success')
    expect(optedIn).not.toHaveProperty('success')
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('derives the member, account email, and lookup time on the server', () => {
    const action = readFileSync('app/(club)/members/email-marketing-actions.ts', 'utf8')
    const card = readFileSync(
      'components/profile/email-marketing-preference-card.tsx',
      'utf8'
    )
    expect(action.startsWith("'use server'")).toBe(true)
    expect(saveEmailMarketingPreference.length).toBe(1)
    expect(action).toContain('email: user.email ?? null')
    expect(action).toContain('target_id: user.id')
    expect(action).toContain("from '@/lib/supabase/admin'")
    expect(action).not.toContain('formData')
    expect(action).not.toContain('searchParams')
    expect(card).not.toContain('supabase/admin')
    expect(card).not.toContain('createAdminClient')
    expect(card).not.toContain('SUPABASE_SERVICE_ROLE')
    expect(card).toContain('saveEmailMarketingPreference(checked)')
  })

  it('does not report success when the commit is blocked by a newer withdrawal', async () => {
    adminRpc.mockResolvedValue({ data: 'blocked_resubscription', error: null })
    const result = await saveEmailMarketingPreference(true)
    expect(result).toEqual({ status: 'blocked_resubscription' })
    expect(result).not.toHaveProperty('success')
  })
})
