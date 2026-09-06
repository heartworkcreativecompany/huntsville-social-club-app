import { describe, expect, it } from 'vitest'
import {
  loginHrefForReturnPath,
  membershipPlanCtaKind,
  paidMembershipPlanFromQuery,
  paidPlanFromSafeNext,
  safeUpgradeReturnPath,
  signupHrefForPaidPlan,
  upgradePathForPlan,
} from '@/lib/membership-plan-links'

describe('paidMembershipPlanFromQuery', () => {
  it('accepts only canonical paid tiers', () => {
    expect(paidMembershipPlanFromQuery('connect')).toBe('connect')
    expect(paidMembershipPlanFromQuery('inner_circle')).toBe('inner_circle')
    expect(paidMembershipPlanFromQuery('elite_circle')).toBe('elite_circle')
  })

  it('ignores invalid plan values', () => {
    expect(paidMembershipPlanFromQuery('Join Connect')).toBeNull()
    expect(paidMembershipPlanFromQuery('member')).toBeNull()
    expect(paidMembershipPlanFromQuery('premium_member')).toBeNull()
    expect(paidMembershipPlanFromQuery('/upgrade')).toBeNull()
    expect(paidMembershipPlanFromQuery('https://evil.example')).toBeNull()
    expect(paidMembershipPlanFromQuery(undefined)).toBeNull()
  })
})

describe('signup and upgrade return paths', () => {
  it('encodes a safe upgrade return path for each paid tier', () => {
    expect(upgradePathForPlan('connect')).toBe('/upgrade?plan=connect')
    expect(signupHrefForPaidPlan('connect')).toBe(
      `/signup?next=${encodeURIComponent('/upgrade?plan=connect')}`
    )
    expect(signupHrefForPaidPlan('inner_circle')).toBe(
      `/signup?next=${encodeURIComponent('/upgrade?plan=inner_circle')}`
    )
    expect(signupHrefForPaidPlan('elite_circle')).toBe(
      `/signup?next=${encodeURIComponent('/upgrade?plan=elite_circle')}`
    )
    expect(signupHrefForPaidPlan('connect')).not.toContain('href="/upgrade"')
    expect(loginHrefForReturnPath('/upgrade?plan=connect')).toBe(
      `/login?next=${encodeURIComponent('/upgrade?plan=connect')}`
    )
  })

  it('extracts only validated paid plans from safe next paths', () => {
    expect(paidPlanFromSafeNext('/upgrade?plan=connect')).toBe('connect')
    expect(paidPlanFromSafeNext('/upgrade?plan=inner_circle')).toBe(
      'inner_circle'
    )
    expect(paidPlanFromSafeNext('/upgrade?plan=elite_circle')).toBe(
      'elite_circle'
    )
    expect(paidPlanFromSafeNext('/upgrade?plan=not_a_tier')).toBeNull()
    expect(paidPlanFromSafeNext('/upgrade')).toBeNull()
    expect(paidPlanFromSafeNext('https://evil.example')).toBeNull()
    expect(paidPlanFromSafeNext('/dashboard')).toBeNull()
  })

  it('accepts encoded or raw upgrade next values and rejects open redirects', () => {
    expect(safeUpgradeReturnPath('/upgrade?plan=connect')).toBe(
      '/upgrade?plan=connect'
    )
    expect(safeUpgradeReturnPath('/upgrade?plan=inner_circle')).toBe(
      '/upgrade?plan=inner_circle'
    )
    expect(safeUpgradeReturnPath('/upgrade?plan=not_a_tier')).toBe('/upgrade')
    expect(safeUpgradeReturnPath('/upgrade')).toBe('/upgrade')
    expect(safeUpgradeReturnPath('https://evil.example')).toBeNull()
    expect(safeUpgradeReturnPath('//evil.example')).toBeNull()
    expect(safeUpgradeReturnPath('/dashboard')).toBeNull()
  })
})

describe('membershipPlanCtaKind', () => {
  it('sends signed-out visitors to signup, with a plan return path for paid CTAs', () => {
    expect(
      membershipPlanCtaKind({
        planKey: 'member',
        mode: 'public',
        currentTier: 'member',
      })
    ).toBe('signup')
    expect(
      membershipPlanCtaKind({
        planKey: 'connect',
        mode: 'public',
        currentTier: 'member',
      })
    ).toBe('signup_with_plan')
    expect(
      membershipPlanCtaKind({
        planKey: 'inner_circle',
        mode: 'public',
        currentTier: 'member',
      })
    ).toBe('signup_with_plan')
    expect(
      membershipPlanCtaKind({
        planKey: 'elite_circle',
        mode: 'public',
        currentTier: 'member',
      })
    ).toBe('signup_with_plan')
  })

  it('uses checkout for approved free members and current-plan for Join Free', () => {
    expect(
      membershipPlanCtaKind({
        planKey: 'member',
        mode: 'member',
        currentTier: 'member',
      })
    ).toBe('current_plan')
    expect(
      membershipPlanCtaKind({
        planKey: 'connect',
        mode: 'member',
        currentTier: 'member',
      })
    ).toBe('checkout')
    expect(
      membershipPlanCtaKind({
        planKey: 'inner_circle',
        mode: 'member',
        currentTier: 'member',
      })
    ).toBe('checkout')
    expect(
      membershipPlanCtaKind({
        planKey: 'elite_circle',
        mode: 'member',
        currentTier: 'member',
      })
    ).toBe('checkout')
  })

  it('uses the billing portal for paid members instead of a second checkout', () => {
    expect(
      membershipPlanCtaKind({
        planKey: 'connect',
        mode: 'member',
        currentTier: 'connect',
      })
    ).toBe('current_plan')
    expect(
      membershipPlanCtaKind({
        planKey: 'inner_circle',
        mode: 'member',
        currentTier: 'connect',
      })
    ).toBe('portal')
    expect(
      membershipPlanCtaKind({
        planKey: 'connect',
        mode: 'member',
        currentTier: 'elite_circle',
      })
    ).toBe('portal')
    expect(
      membershipPlanCtaKind({
        planKey: 'member',
        mode: 'member',
        currentTier: 'inner_circle',
      })
    ).toBe('dashboard')
  })
})
