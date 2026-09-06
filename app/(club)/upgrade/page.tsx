import { redirect } from 'next/navigation'
import PricingPageContent from '@/components/membership/pricing-page-content'
import CheckoutStatusBanner from '@/components/membership/checkout-status-banner'
import { loadMemberEntitlementsForViewer } from '@/lib/load-member-entitlements'
import {
  loginHrefForReturnPath,
  paidMembershipPlanFromQuery,
  upgradePathForPlan,
} from '@/lib/membership-plan-links'
import { readPendingMembershipPlanFromCookies } from '@/lib/pending-membership-plan-server'
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
  const currentTier = entitlements?.productTier ?? 'member'

  return (
    <>
      <CheckoutStatusBanner status={checkoutStatus} />
      <PricingPageContent
        mode="member"
        currentTier={
          currentTier === 'inner_circle' ||
          currentTier === 'elite_circle' ||
          currentTier === 'connect' ||
          currentTier === 'member'
            ? currentTier
            : 'member'
        }
        selectedPlan={selectedPlan}
      />
    </>
  )
}
