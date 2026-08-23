import { describe, expect, it } from 'vitest'
import {
  ADMIN_MEMBER_DETAIL_FORBIDDEN_KEYS,
  buildAdminMemberOverview,
  loadAdminMemberDetail,
  stripAdminMemberDetailSecrets,
} from '@/lib/admin/member-detail'
import { ADMIN_NOT_AUTHORIZED_ERROR } from '@/lib/membership-access-override'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

describe('admin member detail DTO', () => {
  it('omits Stripe IDs, payment secrets, and Identity session data', () => {
    const overview = buildAdminMemberOverview({
      id: 'member-1',
      email: 'alex@example.com',
      fullName: 'Alex Rivera',
      role: 'member',
      applicationStatus: 'approved',
      membershipIntent: 'Looking to meet people at mixers.',
      locationArea: 'Downtown',
      locationCity: 'Huntsville',
      connectionIntents: ['friends'],
      connectionsOpenTo: null,
      discoveryIntent: null,
      identityVerificationStatus: 'verified',
      identityVerifiedAt: '2026-08-01T12:00:00.000Z',
      membershipBilling: {
        tier: 'inner_circle',
        subscription_status: 'active',
        plan: 'monthly',
        stripe_customer_id: 'cus_secret',
        stripe_subscription_id: 'sub_secret',
        stripe_price_id: 'price_secret',
        billing_period_end: '2026-09-01T00:00:00.000Z',
      },
      messagingSuspendedAt: null,
      messagingSuspensionReason: null,
      profileRevisionStatus: null,
      applicationDraft: null,
      accessOverride: null,
    })

    const serialized = JSON.stringify(overview)
    expect(serialized).not.toContain('cus_secret')
    expect(serialized).not.toContain('sub_secret')
    expect(serialized).not.toContain('price_secret')
    expect(serialized).not.toContain('identity_verification_session_id')
    expect(overview.stripeSubscription.subscriptionStatus).toBe('active')
    expect(overview.stripeSubscription.cycleEnd).toBe('2026-09-01T00:00:00.000Z')
    expect(overview.identityVerificationLabel).toBe('Verified')
    expect(overview).not.toHaveProperty('identity_verification_session_id')
    expect(ADMIN_MEMBER_DETAIL_FORBIDDEN_KEYS).toContain('stripe_customer_id')
  })

  it('shows complimentary override as the membership display source', () => {
    const overview = buildAdminMemberOverview({
      id: 'member-1',
      email: 'alex@example.com',
      fullName: 'Alex Rivera',
      role: 'member',
      applicationStatus: 'approved',
      membershipIntent: null,
      locationArea: null,
      locationCity: null,
      connectionIntents: null,
      connectionsOpenTo: null,
      discoveryIntent: null,
      identityVerificationStatus: 'not_started',
      identityVerifiedAt: null,
      membershipBilling: { tier: 'member', subscription_status: 'none' },
      messagingSuspendedAt: null,
      messagingSuspensionReason: null,
      profileRevisionStatus: 'pending',
      applicationDraft: null,
      accessOverride: {
        id: 'override-1',
        userId: 'member-1',
        tier: 'elite_circle',
        startsAt: '2026-01-01T00:00:00.000Z',
        expiresAt: null,
        reason: 'Private courtesy note',
        grantedBy: 'admin-1',
        revokedAt: null,
        revokedBy: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    })

    expect(overview.membershipSource).toBe('complimentary_override')
    expect(overview.membershipDisplayStatus).toContain(
      'Complimentary access override — Elite Circle'
    )
    expect(overview.stripeSubscription.subscriptionStatus).toBe('none')
  })

  it('strips forbidden keys from nested payloads', () => {
    const stripped = stripAdminMemberDetailSecrets({
      safe: 'ok',
      stripe_customer_id: 'cus_secret',
      nested: {
        stripe_subscription_id: 'sub_secret',
        identity_verification_session_id: 'vs_secret',
      },
    })
    expect(stripped).toEqual({ safe: 'ok', nested: {} })
  })

  it('refuses non-admin loads without querying', async () => {
    const from = () => {
      throw new Error('should not query')
    }
    const result = await loadAdminMemberDetail(
      { from } as unknown as SupabaseClient<Database>,
      { isAdmin: false, memberId: 'member-1' }
    )
    expect(result).toEqual({ ok: false, error: ADMIN_NOT_AUTHORIZED_ERROR })
  })
})
