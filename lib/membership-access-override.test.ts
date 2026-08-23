import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  ADMIN_NOT_AUTHORIZED_ERROR,
  denyNonAdminMembershipAccessOverride,
  grantMembershipAccessOverrideConfirmationCopy,
  isActiveMembershipAccessOverride,
  membershipAccessOverrideAuditDetails,
  revokeMembershipAccessOverrideConfirmationCopy,
} from '@/lib/membership-access-override'
import { buildMemberEntitlements } from '@/lib/membership-entitlements'

const freeBilling = {
  tier: 'member' as const,
  plan: null,
  subscription_status: 'none' as const,
  renewal_at: null,
  cancelled_at: null,
  plan_change_pending: null,
  payment_failure: { active: false, since: null, reminder_sent_at: null },
  billing_period_start: null,
  billing_period_end: null,
  stripe_customer_id: 'cus_secret',
  stripe_subscription_id: 'sub_secret',
}

const innerOverride = {
  tier: 'inner_circle' as const,
  startsAt: '2026-01-01T00:00:00.000Z',
  expiresAt: null,
  revokedAt: null,
}

describe('membership access override confirmation and audit', () => {
  it('uses the exact grant and revoke confirmation copy', () => {
    expect(
      grantMembershipAccessOverrideConfirmationCopy('Inner Circle', 'Alex Rivera')
    ).toBe(
      'Grant complimentary Inner Circle access to Alex Rivera? This does not change their Stripe subscription or billing.'
    )
    expect(
      revokeMembershipAccessOverrideConfirmationCopy('Elite Circle', 'Alex Rivera')
    ).toBe(
      'Revoke complimentary Elite Circle access from Alex Rivera? Stripe subscription state is unchanged.'
    )
  })

  it('keeps admin reason only in audit details', () => {
    const details = membershipAccessOverrideAuditDetails({
      tier: 'elite_circle',
      startsAt: '2026-08-01T00:00:00.000Z',
      expiresAt: null,
      reason: 'Founding year courtesy',
    })
    expect(JSON.parse(details)).toEqual({
      tier: 'elite_circle',
      starts_at: '2026-08-01T00:00:00.000Z',
      expires_at: null,
      reason: 'Founding year courtesy',
    })
    expect(ADMIN_NOT_AUTHORIZED_ERROR).toBe('Administrator access required.')
    expect(denyNonAdminMembershipAccessOverride(false)).toBe(
      ADMIN_NOT_AUTHORIZED_ERROR
    )
    expect(denyNonAdminMembershipAccessOverride(true)).toBeNull()
  })
})

describe('complimentary override entitlements precedence', () => {
  it('grants override tier while Stripe billing stays read-only', () => {
    const entitlements = buildMemberEntitlements({
      role: 'member',
      applicationApproved: true,
      billing: freeBilling,
      accessOverride: innerOverride,
    })

    expect(entitlements.productTier).toBe('inner_circle')
    expect(entitlements.canMessage).toBe(true)
    expect(entitlements.canAccessCircleSocial).toBe(true)
    expect(entitlements.billing.tier).toBe('member')
    expect(entitlements.billing.subscription_status).toBe('none')
    expect(entitlements.subscriptionActive).toBe(false)
    expect(entitlements.accessOverride?.tier).toBe('inner_circle')
    expect(entitlements.accessOverride).not.toHaveProperty('reason')
    expect(entitlements.accessOverride).not.toHaveProperty('grantedBy')
  })

  it('expires correctly and falls back to Stripe', () => {
    const now = new Date('2026-08-23T12:00:00.000Z')
    const expired = buildMemberEntitlements({
      role: 'member',
      applicationApproved: true,
      billing: freeBilling,
      now,
      accessOverride: {
        ...innerOverride,
        expiresAt: '2026-08-01T00:00:00.000Z',
      },
    })
    expect(expired.productTier).toBe('member')
    expect(expired.canMessage).toBe(false)
    expect(expired.accessOverride).toBeNull()

    const revoked = buildMemberEntitlements({
      role: 'member',
      applicationApproved: true,
      billing: freeBilling,
      now,
      accessOverride: {
        ...innerOverride,
        revokedAt: '2026-08-20T00:00:00.000Z',
      },
    })
    expect(revoked.productTier).toBe('member')
    expect(revoked.canMessage).toBe(false)
  })

  it('treats a future start as inactive', () => {
    expect(
      isActiveMembershipAccessOverride(
        {
          ...innerOverride,
          startsAt: '2026-12-01T00:00:00.000Z',
        },
        new Date('2026-08-23T12:00:00.000Z')
      )
    ).toBe(false)
  })
})

describe('override and badge source guards', () => {
  it('does not add Stripe columns or write Stripe billing', () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260823230000_membership_access_overrides.sql'
      ),
      'utf8'
    )
    expect(sql).toContain('membership_access_overrides')
    expect(sql).toContain('membership_access_override_granted')
    expect(sql).not.toMatch(/stripe_customer_id|stripe_subscription_id|stripe_price_id/)
    expect(sql).not.toMatch(/create table[\s\S]*coupon/i)
  })

  it('keeps override and badge modules off Stripe write/sync paths', () => {
    const files = [
      'lib/membership-access-override.ts',
      'lib/membership-access-override/admin.ts',
      'lib/recognition-badges/admin.ts',
      'lib/recognition-badges/catalog.ts',
      'components/admin/admin-membership-access-override.tsx',
      'components/admin/admin-member-badges-manager.tsx',
      'app/(club)/admin/users/[id]/actions.ts',
    ]
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8')
      expect(source).not.toMatch(
        /from ['"]@\/lib\/stripe(\/|$)|sync-subscription|stripe\/webhook|updateMembershipBilling/
      )
    }
  })

  it('does not rewrite Stripe webhook, Dating, Friendship, or messaging modules with badge UI', () => {
    const files = [
      'app/api/stripe/webhook/route.ts',
      'lib/stripe/sync-subscription.ts',
      'lib/compatibility/eligibility.ts',
      'lib/friendship/eligibility.ts',
      'lib/member-messages.ts',
    ]
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8')
      expect(source).not.toContain('admin-member-badges-manager')
      expect(source).not.toContain('admin-membership-access-override')
      expect(source).not.toContain('recognition-badges/admin')
    }
  })
})
