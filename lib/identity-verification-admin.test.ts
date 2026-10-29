import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  acceptedIdentityForAdmin,
  approveInPersonIdentity,
  revokeInPersonIdentity,
  toInPersonIdentityAdminState,
} from '@/lib/identity-verification-admin'

function createRpcClient(result: {
  data?: unknown
  error?: { message: string } | null
}) {
  const calls: Array<{ fn: string; args: unknown }> = []
  return {
    calls,
    client: {
      rpc: async (fn: string, args: unknown) => {
        calls.push({ fn, args })
        return result
      },
    } as unknown as SupabaseClient<Database>,
  }
}

describe('in-person identity admin actions', () => {
  it('does not call the database without confirmation or a reason', async () => {
    const recorded = createRpcClient({ data: null, error: null })
    const result = await approveInPersonIdentity(recorded.client, {
      profileId: 'member-2',
      confirmed: false,
    })
    expect(result.ok).toBe(false)
    expect(recorded.calls).toHaveLength(0)

    const revoked = createRpcClient({ data: null, error: null })
    const revokeResult = await revokeInPersonIdentity(revoked.client, {
      profileId: 'member-2',
      reason: '   ',
    })
    expect(revokeResult).toEqual({
      ok: false,
      error: 'A revocation reason is required.',
    })
    expect(revoked.calls).toHaveLength(0)
  })

  it('calls the atomic record function without an actor argument', async () => {
    const recorded = createRpcClient({
      data: { id: 'row-1', already_verified: false },
      error: null,
    })
    const result = await approveInPersonIdentity(recorded.client, {
      profileId: 'member-2',
      confirmed: true,
    })
    expect(result).toEqual({ ok: true, alreadyVerified: false })
    expect(recorded.calls).toEqual([
      {
        fn: 'record_in_person_identity_verification',
        args: { target_profile_id: 'member-2', confirmed: true },
      },
    ])
  })

  it('returns an error when the atomic record function fails', async () => {
    const recorded = createRpcClient({
      data: null,
      error: { message: 'forced audit failure' },
    })
    const result = await approveInPersonIdentity(recorded.client, {
      profileId: 'member-2',
      confirmed: true,
    })
    expect(result).toEqual({
      ok: false,
      error: 'Could not record in-person identity verification.',
    })
  })

  it('calls the atomic revoke function with the reason and no actor argument', async () => {
    const revoked = createRpcClient({ data: { id: 'row-1' }, error: null })
    const result = await revokeInPersonIdentity(revoked.client, {
      profileId: 'member-2',
      reason: '  Wrong member was checked.  ',
    })
    expect(result).toEqual({ ok: true })
    expect(revoked.calls).toEqual([
      {
        fn: 'revoke_in_person_identity_verification',
        args: {
          target_profile_id: 'member-2',
          reason: 'Wrong member was checked.',
        },
      },
    ])
  })

  it('returns an error when the atomic revoke function fails', async () => {
    const revoked = createRpcClient({
      data: null,
      error: { message: 'forced audit failure' },
    })
    const result = await revokeInPersonIdentity(revoked.client, {
      profileId: 'member-2',
      reason: 'Wrong member was checked.',
    })
    expect(result).toEqual({
      ok: false,
      error: 'Could not revoke in-person identity verification.',
    })
    expect(result.ok === false && result.error).not.toMatch(/was revoked, but the audit/i)
  })

  it('does not describe a failed audit as a saved verification', () => {
    const source = readFileSync('lib/identity-verification-admin.ts', 'utf8')
    expect(source).not.toContain('was saved, but the audit record failed')
    expect(source).not.toContain('was revoked, but the audit record failed')
    expect(source).not.toContain('logModerationAction')
  })

  it('keeps a revoked row in history with the actor and reason', () => {
    const state = toInPersonIdentityAdminState({
      rows: [
        {
          id: 'row-1',
          source: 'admin_action',
          approved_by: 'admin-1',
          approved_at: '2026-10-01T00:00:00.000Z',
          reconciled_at: null,
          note: null,
          status: 'revoked',
          revoked_at: '2026-10-02T00:00:00.000Z',
          revoked_by: 'admin-2',
        },
      ],
      names: new Map([
        ['admin-1', 'Ada Admin'],
        ['admin-2', 'Bea Admin'],
      ]),
      reasons: new Map([['row-1', 'Wrong member was checked.']]),
    })

    expect(state.lookupOk).toBe(true)
    expect(state.active).toBeNull()
    expect(state.history).toEqual([
      {
        id: 'row-1',
        recordedAt: '2026-10-01T00:00:00.000Z',
        verifierName: 'Ada Admin',
        revokedAt: '2026-10-02T00:00:00.000Z',
        revokerName: 'Bea Admin',
        reason: 'Wrong member was checked.',
      },
    ])
  })

  it('refuses to choose among conflicting active records', () => {
    const state = toInPersonIdentityAdminState({
      rows: [
        {
          id: 'row-1',
          source: 'admin_action',
          approved_by: 'admin-1',
          approved_at: '2026-10-01T00:00:00.000Z',
          reconciled_at: null,
          note: null,
          status: 'verified',
          revoked_at: null,
          revoked_by: null,
        },
        {
          id: 'row-2',
          source: 'admin_action',
          approved_by: 'admin-2',
          approved_at: '2026-10-02T00:00:00.000Z',
          reconciled_at: null,
          note: null,
          status: 'verified',
          revoked_at: null,
          revoked_by: null,
        },
      ],
      names: new Map(),
      reasons: new Map(),
    })
    expect(state).toEqual({ lookupOk: false, active: null, history: [] })
  })

  it('uses the existing identity resolver for in-person and Stripe sources', () => {
    expect(
      acceptedIdentityForAdmin({
        stripeStatus: 'not_started',
        lookupOk: true,
        active: true,
      })
    ).toBe('verified')
    expect(
      acceptedIdentityForAdmin({
        stripeStatus: 'not_started',
        lookupOk: true,
        active: false,
      })
    ).toBe('unverified')
    expect(
      acceptedIdentityForAdmin({
        stripeStatus: 'verified',
        lookupOk: true,
        active: false,
      })
    ).toBe('verified')
    expect(
      acceptedIdentityForAdmin({
        stripeStatus: 'verified',
        lookupOk: false,
        active: false,
      })
    ).toBe('unavailable')
  })
})
