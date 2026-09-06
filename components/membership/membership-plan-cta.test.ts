import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import PricingBottomCta from '@/components/membership/pricing-bottom-cta'
import PricingPlanCards from '@/components/membership/pricing-plan-cards'
import { signupHrefForPaidPlan } from '@/lib/membership-plan-links'

const repoRoot = join(__dirname, '../..')

describe('Upgrade bottom CTA and pricing-card actions', () => {
  it('sends signed-out Join Free to signup and paid CTAs to encoded upgrade return paths', () => {
    const html = renderToStaticMarkup(
      createElement(PricingBottomCta, { variant: 'marketing' })
    )
    expect(html).toContain('href="/signup"')
    expect(html).toContain(`href="${signupHrefForPaidPlan('connect')}"`)
    expect(html).toContain(`href="${signupHrefForPaidPlan('inner_circle')}"`)
    expect(html).toContain(`href="${signupHrefForPaidPlan('elite_circle')}"`)
    expect(html).not.toContain('href="/upgrade"')
    expect(html).toContain('Join Free')
    expect(html).toContain('Join Connect')
    expect(html).toContain('Join Inner Circle')
    expect(html).toContain('Join Elite Circle')
  })

  it('does not self-link paid club CTAs to /upgrade', () => {
    const html = renderToStaticMarkup(
      createElement(PricingBottomCta, {
        variant: 'club',
        currentTier: 'member',
      })
    )
    expect(html).not.toContain('href="/upgrade"')
    expect(html).toContain('Current plan')
    expect(html).toContain('Join Connect')
    expect(html).toContain('type="button"')
  })

  it('marks the current paid plan and keeps other paid CTAs off checkout hrefs', () => {
    const html = renderToStaticMarkup(
      createElement(PricingBottomCta, {
        variant: 'club',
        currentTier: 'connect',
      })
    )
    expect(html).toContain('Current plan')
    expect(html).not.toContain('href="/upgrade"')
    expect(html).toContain('Join Inner Circle')
    expect(html).toContain('Join Elite Circle')
  })

  it('keeps public pricing cards on the same signup-with-plan hrefs', () => {
    const html = renderToStaticMarkup(
      createElement(PricingPlanCards, { mode: 'public' })
    )
    expect(html).toContain(`href="${signupHrefForPaidPlan('connect')}"`)
    expect(html).toContain(`href="${signupHrefForPaidPlan('inner_circle')}"`)
    expect(html).toContain(`href="${signupHrefForPaidPlan('elite_circle')}"`)
    expect(html).not.toContain('href="/upgrade"')
  })

  it('uses the server checkout action with canonical tier codes, not labels', () => {
    const cta = readFileSync(
      join(repoRoot, 'components/membership/membership-plan-cta.tsx'),
      'utf8'
    )
    const buttons = readFileSync(
      join(repoRoot, 'components/membership/membership-billing-buttons.tsx'),
      'utf8'
    )
    const actions = readFileSync(
      join(repoRoot, 'app/(club)/membership/actions.ts'),
      'utf8'
    )
    expect(cta).toContain('MembershipCheckoutButton')
    expect(cta).toContain('BillingPortalButton')
    expect(cta).toContain('planKey as PaidMembershipTier')
    expect(cta).not.toContain("tier={'Join Connect'}")
    expect(buttons).toContain('createMembershipCheckoutSession(tier)')
    expect(buttons).toContain('createBillingPortalSession')
    expect(actions).toContain('isPaidMembershipTier(tierInput)')
    expect(actions).toContain('product_tier: tier')
    expect(actions).toContain('subscriptionBlocksNewCheckout')
  })

  it('does not start entitlement cycles from the CTA path', () => {
    const cta = readFileSync(
      join(repoRoot, 'components/membership/membership-plan-cta.tsx'),
      'utf8'
    )
    const sync = readFileSync(
      join(repoRoot, 'lib/stripe/sync-subscription.ts'),
      'utf8'
    )
    expect(cta).not.toContain('startEntitlementCycle')
    expect(sync).toContain('isCircleProductTier(mappedTier)')
  })

  it('ignores invalid upgrade plan query values in the upgrade page', () => {
    const page = readFileSync(
      join(repoRoot, 'app/(club)/upgrade/page.tsx'),
      'utf8'
    )
    expect(page).toContain('paidMembershipPlanFromQuery(params.plan)')
    expect(page).toContain('loginHrefForReturnPath')
    expect(page).toContain("redirect('/application')")
    expect(page).toContain('readPendingMembershipPlanFromCookies')
  })
})
