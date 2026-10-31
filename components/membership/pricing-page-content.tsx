import PricingBottomCta from '@/components/membership/pricing-bottom-cta'
import PricingComparisonTable from '@/components/membership/pricing-comparison-table'
import PricingFaq from '@/components/membership/pricing-faq'
import PricingPlanCards from '@/components/membership/pricing-plan-cards'
import { isFriendshipMatchingEnabled } from '@/lib/friendship/eligibility'
import {
  PRICING_HEADLINE,
  PRICING_SUBHEADLINE,
  PRICING_SUPPORTING_LINE,
  preparedNewPurchaseMembershipCopy,
} from '@/lib/membership-pricing-copy'

type PricingPageContentProps = {
  mode: 'public' | 'member'
  currentTier?: 'member' | 'connect' | 'inner_circle' | 'elite_circle'
  selectedPlan?: 'connect' | 'inner_circle' | 'elite_circle' | null
  hasPaidStripeSubscription?: boolean
}

export default function PricingPageContent({
  mode,
  currentTier = 'member',
  selectedPlan = null,
  hasPaidStripeSubscription = false,
}: PricingPageContentProps) {
  const friendshipMatchingEnabled = isFriendshipMatchingEnabled()
  const offer = preparedNewPurchaseMembershipCopy({ friendshipMatchingEnabled })

  return (
    <div className="mx-auto max-w-6xl">
      <header className="max-w-3xl">
        <p className="eyebrow">Membership</p>
        <h1 className="text-display mt-2 text-3xl font-semibold sm:text-4xl md:text-5xl">
          {PRICING_HEADLINE}
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">{PRICING_SUBHEADLINE}</p>
        <p className="mt-3 text-sm text-muted-foreground">
          {PRICING_SUPPORTING_LINE}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          {offer.existingSubscription} {offer.complimentary}
        </p>
        {mode === 'member' && currentTier === 'connect' ? (
          <p className="mt-4 max-w-3xl text-sm text-muted-foreground">
            Your current plan is Connect. It remains active and can be managed
            in billing. New memberships are Free, Inner Circle, and Elite Circle.
          </p>
        ) : null}
      </header>

      <div className="mt-12">
        <PricingPlanCards
          mode={mode}
          currentTier={currentTier}
          selectedPlan={selectedPlan}
          hasPaidStripeSubscription={hasPaidStripeSubscription}
          friendshipMatchingEnabled={friendshipMatchingEnabled}
        />
      </div>

      <PricingComparisonTable />
      <PricingFaq friendshipMatchingEnabled={friendshipMatchingEnabled} />
      <PricingBottomCta
        variant={mode === 'public' ? 'marketing' : 'club'}
        currentTier={currentTier}
        selectedPlan={selectedPlan}
        hasPaidStripeSubscription={hasPaidStripeSubscription}
      />
    </div>
  )
}
