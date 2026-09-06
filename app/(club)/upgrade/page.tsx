import { redirect } from 'next/navigation'
import PricingPageContent from '@/components/membership/pricing-page-content'
import CheckoutStatusBanner from '@/components/membership/checkout-status-banner'
import { loadMemberEntitlementsForViewer } from '@/lib/load-member-entitlements'
import { getViewer } from '@/lib/viewer'

type UpgradePageProps = {
  searchParams: Promise<{ checkout?: string }>
}

export default async function UpgradePage({ searchParams }: UpgradePageProps) {
  const viewer = await getViewer()

  if (!viewer) {
    redirect('/login')
  }

  if (!viewer.canAccessApp) {
    redirect('/application')
  }

  const params = await searchParams
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
      />
    </>
  )
}
