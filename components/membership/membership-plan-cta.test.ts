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
    expect(html).toContain('data-membership-cta="checkout"')
    expect(html).not.toContain('data-membership-cta="portal"')
  })

  it('opens the Portal for a paid subscriber changing plans and marks the current plan', () => {
    const html = renderToStaticMarkup(
      createElement(PricingBottomCta, {
        variant: 'club',
        currentTier: 'connect',
        hasPaidStripeSubscription: true,
      })
    )
    expect(html).toContain('data-membership-cta="current_plan"')
    expect(html).toContain('data-membership-cta="portal"')
    expect(html).not.toContain('data-membership-cta="checkout"')
    expect(html).not.toContain('href="/upgrade"')
    expect(html).toContain('Join Inner Circle')
    expect(html).toContain('Join Elite Circle')
    expect(html).not.toContain('Manage billing in your profile')
  })

  it('does not call Checkout for a subscriber whose billed tier is missing but Stripe is active', () => {
    const html = renderToStaticMarkup(
      createElement(PricingBottomCta, {
        variant: 'club',
        currentTier: 'member',
        hasPaidStripeSubscription: true,
      })
    )
    expect(html).toContain('data-membership-cta="portal"')
    expect(html).not.toContain('data-membership-cta="checkout"')
  })

  it('does not try Portal or Checkout for complimentary/staff entitlements without Stripe', () => {
    const html = renderToStaticMarkup(
      createElement(PricingBottomCta, {
        variant: 'club',
        currentTier: 'elite_circle',
        hasPaidStripeSubscription: false,
      })
    )
    expect(html).toContain('data-membership-cta="current_plan"')
    expect(html).toContain('data-membership-cta="billing_unavailable"')
    expect(html).not.toContain('data-membership-cta="checkout"')
    expect(html).not.toContain('data-membership-cta="portal"')
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
    expect(buttons).not.toContain('alert(')
    expect(buttons).toContain('role="alert"')
    expect(actions).toContain('isPaidMembershipTier(tierInput)')
    expect(actions).toContain('product_tier: tier')
    expect(actions).toContain('subscriptionBlocksNewCheckout')
    expect(actions).toContain('DUPLICATE_SUBSCRIPTION_CHECKOUT_MESSAGE')
    expect(actions).toContain('BILLING_PORTAL_UNAVAILABLE_MESSAGE')
    expect(actions).toContain('BILLING_NOT_IN_STRIPE_MESSAGE')
    expect(actions).toContain('export async function createBillingPortalSession()')
    expect(actions).not.toContain('createBillingPortalSession(customerId')
    expect(actions).toContain('if (!viewer.canAccessApp)')
    expect(actions).toContain('BILLING_APPROVAL_REQUIRED_MESSAGE')
    expect(actions).toContain('billing.stripe_customer_id')
    expect(actions).not.toContain('Manage billing in your profile')
    expect(actions).not.toContain('customer: customerIdFromClient')
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
    expect(page).toContain('stripeSubscriptionBlocksNewCheckout')
    expect(page).toContain('hasPaidStripeSubscription')
  })
})
