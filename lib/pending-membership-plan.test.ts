import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { loginHrefForReturnPath } from '@/lib/membership-plan-links'
import {
  applyPendingMembershipPlanCookie,
  capturePendingMembershipPlan,
  PENDING_MEMBERSHIP_PLAN_COOKIE,
  PENDING_MEMBERSHIP_PLAN_MAX_AGE_SECONDS,
  pendingMembershipPlanFromCookie,
  resolveMembershipContinuation,
} from '@/lib/pending-membership-plan'

const repoRoot = join(__dirname, '..')

function cookieFrom(response: NextResponse): string | undefined {
  return response.cookies.get(PENDING_MEMBERSHIP_PLAN_COOKIE)?.value
}

describe('pending membership plan capture', () => {
  it('captures Connect, Inner Circle, and Elite Circle from signup and login next params', () => {
    for (const tier of ['connect', 'inner_circle', 'elite_circle'] as const) {
      const next = encodeURIComponent(`/upgrade?plan=${tier}`)
      expect(
        capturePendingMembershipPlan({
          pathname: '/signup',
          searchParams: new URLSearchParams(`next=${next}`),
        })
      ).toBe(tier)
      expect(
        capturePendingMembershipPlan({
          pathname: '/login',
          searchParams: new URLSearchParams(`next=${next}`),
        })
      ).toBe(tier)
      expect(
        capturePendingMembershipPlan({
          pathname: '/auth/callback',
          searchParams: new URLSearchParams(`next=${next}`),
        })
      ).toBe(tier)
    }
  })

  it('drops invalid plan values and open redirects', () => {
    expect(
      capturePendingMembershipPlan({
        pathname: '/signup',
        searchParams: new URLSearchParams(
          `next=${encodeURIComponent('/upgrade?plan=Join%20Connect')}`
        ),
      })
    ).toBeNull()
    expect(
      capturePendingMembershipPlan({
        pathname: '/signup',
        searchParams: new URLSearchParams(
          `next=${encodeURIComponent('https://evil.example')}`
        ),
      })
    ).toBeNull()
    expect(
      capturePendingMembershipPlan({
        pathname: '/signup',
        searchParams: new URLSearchParams(
          `next=${encodeURIComponent('//evil.example')}`
        ),
      })
    ).toBeNull()
    expect(
      capturePendingMembershipPlan({
        pathname: '/login',
        searchParams: new URLSearchParams(
          `next=${encodeURIComponent('/dashboard')}`
        ),
      })
    ).toBeNull()
    expect(pendingMembershipPlanFromCookie('premium_member')).toBeNull()
    expect(pendingMembershipPlanFromCookie('/upgrade?plan=connect')).toBeNull()
  })

  it('does not capture plan query strings on unrelated routes', () => {
    expect(
      capturePendingMembershipPlan({
        pathname: '/dashboard',
        searchParams: new URLSearchParams('plan=connect'),
      })
    ).toBeNull()
    expect(
      capturePendingMembershipPlan({
        pathname: '/upgrade',
        searchParams: new URLSearchParams('plan=connect'),
      })
    ).toBeNull()
  })
})

describe('applyPendingMembershipPlanCookie', () => {
  it('stores only the canonical plan code on signup, login, and auth callback', () => {
    const request = new NextRequest(
      'http://localhost/signup?next=%2Fupgrade%3Fplan%3Dinner_circle'
    )
    const response = applyPendingMembershipPlanCookie(
      request,
      NextResponse.next()
    )
    expect(cookieFrom(response)).toBe('inner_circle')
    const cookie = response.cookies.get(PENDING_MEMBERSHIP_PLAN_COOKIE)
    expect(cookie?.httpOnly).toBe(true)
    expect(cookie?.path).toBe('/')
    expect(PENDING_MEMBERSHIP_PLAN_MAX_AGE_SECONDS).toBe(60 * 60 * 24 * 30)
  })

  it('does not set a cookie for invalid next values', () => {
    const request = new NextRequest(
      `http://localhost/signup?next=${encodeURIComponent('https://evil.example/phish')}`
    )
    const response = applyPendingMembershipPlanCookie(
      request,
      NextResponse.next()
    )
    expect(cookieFrom(response)).toBeUndefined()
  })
})

describe('resolveMembershipContinuation', () => {
  it('keeps unapproved users on application and does not start checkout', () => {
    for (const tier of ['connect', 'inner_circle', 'elite_circle'] as const) {
      expect(
        resolveMembershipContinuation({
          signedIn: true,
          approved: false,
          cookiePlan: tier,
        })
      ).toEqual({ path: '/application', clearCookie: false })
    }
  })

  it('sends approved users with a saved valid plan to Upgrade and clears the cookie', () => {
    expect(
      resolveMembershipContinuation({
        signedIn: true,
        approved: true,
        cookiePlan: 'connect',
      })
    ).toEqual({ path: '/upgrade?plan=connect', clearCookie: true })
    expect(
      resolveMembershipContinuation({
        signedIn: true,
        approved: true,
        cookiePlan: 'inner_circle',
      })
    ).toEqual({ path: '/upgrade?plan=inner_circle', clearCookie: true })
    expect(
      resolveMembershipContinuation({
        signedIn: true,
        approved: true,
        cookiePlan: 'elite_circle',
      })
    ).toEqual({ path: '/upgrade?plan=elite_circle', clearCookie: true })
  })

  it('preserves current post-approval routing when no valid plan is saved', () => {
    expect(
      resolveMembershipContinuation({
        signedIn: true,
        approved: true,
        cookiePlan: null,
      })
    ).toEqual({ path: '/dashboard', clearCookie: false })
    expect(
      resolveMembershipContinuation({
        signedIn: true,
        approved: false,
        cookiePlan: null,
      })
    ).toEqual({ path: '/application', clearCookie: false })
  })

  it('ignores invalid requested plans and does not open-redirect', () => {
    expect(
      resolveMembershipContinuation({
        signedIn: true,
        approved: true,
        cookiePlan: null,
        requestedPlan: 'https://evil.example',
      })
    ).toEqual({ path: '/dashboard', clearCookie: false })
    expect(
      resolveMembershipContinuation({
        signedIn: true,
        approved: true,
        cookiePlan: 'connect',
        requestedPlan: 'not_a_tier',
      })
    ).toEqual({ path: '/upgrade?plan=connect', clearCookie: true })
    expect(
      resolveMembershipContinuation({
        signedIn: false,
        approved: false,
        cookiePlan: 'elite_circle',
        requestedPlan: '//evil.example',
      })
    ).toEqual({
      path: loginHrefForReturnPath('/upgrade?plan=elite_circle'),
      clearCookie: false,
    })
  })
})

describe('pending plan wiring', () => {
  it('captures the plan through proxy, signup confirmation, and post-approval continue', () => {
    const proxy = readFileSync(join(repoRoot, 'proxy.ts'), 'utf8')
    const callback = readFileSync(
      join(repoRoot, 'app/auth/callback/route.ts'),
      'utf8'
    )
    const continueRoute = readFileSync(
      join(repoRoot, 'app/auth/continue/route.ts'),
      'utf8'
    )
    const layout = readFileSync(
      join(repoRoot, 'app/(club)/layout.tsx'),
      'utf8'
    )
    const upgrade = readFileSync(
      join(repoRoot, 'app/(club)/upgrade/page.tsx'),
      'utf8'
    )
    const checkout = readFileSync(
      join(repoRoot, 'app/(club)/membership/actions.ts'),
      'utf8'
    )

    expect(proxy).toContain('applyPendingMembershipPlanCookie')
    expect(callback).toContain('paidPlanFromSafeNext(next)')
    expect(callback).toContain('setPendingMembershipPlanOnResponse')
    expect(continueRoute).toContain('resolveMembershipContinuation')
    expect(continueRoute).toContain('clearPendingMembershipPlanOnResponse')
    expect(continueRoute).not.toContain('createMembershipCheckoutSession')
    expect(layout).toContain('redirectIfPendingMembershipPlan(viewer.canAccessApp)')
    expect(upgrade).toContain("redirect('/application')")
    expect(upgrade).toContain('readPendingMembershipPlanFromCookies')
    expect(checkout).toContain('if (!viewer.canAccessApp)')
    expect(checkout).toContain(
      "return { error: 'Membership approval is required before upgrading.' }"
    )
  })
})
