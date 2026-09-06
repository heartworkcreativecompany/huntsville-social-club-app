import { redirect } from 'next/navigation'
import PricingPageContent from '@/components/membership/pricing-page-content'
import CheckoutStatusBanner from '@/components/membership/checkout-status-banner'
import { loadMemberEntitlementsForViewer } from '@/lib/load-member-entitlements'
import {
  loginHrefForReturnPath,
  paidMembershipPlanFromQuery,
  upgradeCtaCurrentPlanKey,
  upgradePathForPlan,
} from '@/lib/membership-plan-links'
import { readPendingMembershipPlanFromCookies } from '@/lib/pending-membership-plan-server'
import {
  billedPaidMembershipTier,
  stripeSubscriptionBlocksNewCheckout,
} from '@/lib/membership-systems'
import { getViewer } from '@/lib/viewer'

type UpgradePageProps = {
  searchParams: Promise<{ checkout?: string; plan?: string }>
}

export default async function UpgradePage({ searchParams }: UpgradePageProps) {
  const viewer = await getViewer()
  const params = await searchParams
  const selectedPlan =
    paidMembershipPlanFromQuery(params.plan) ??
    (await readPendingMembershipPlanFromCookies())
  const upgradeReturnPath = selectedPlan
    ? upgradePathForPlan(selectedPlan)
    : '/upgrade'

  if (!viewer) {
    redirect(loginHrefForReturnPath(upgradeReturnPath))
  }

  if (!viewer.canAccessApp) {
    redirect('/application')
  }

  const checkoutStatus =
    params.checkout === 'success'
      ? 'success'
      : params.checkout === 'cancelled'
        ? 'cancelled'
        : null

  const { entitlements } = await loadMemberEntitlementsForViewer()
  const billing = entitlements?.billing
  const hasPaidStripeSubscription = billing
    ? stripeSubscriptionBlocksNewCheckout(billing)
    : false
  const currentTier = upgradeCtaCurrentPlanKey({
    productTier: entitlements?.productTier,
    billedPaidTier: billing ? billedPaidMembershipTier(billing) : null,
  })

  return (
    <>
      <CheckoutStatusBanner status={checkoutStatus} />
      <PricingPageContent
        mode="member"
        currentTier={currentTier}
        selectedPlan={selectedPlan}
        hasPaidStripeSubscription={hasPaidStripeSubscription}
      />
    </>
  )
}
