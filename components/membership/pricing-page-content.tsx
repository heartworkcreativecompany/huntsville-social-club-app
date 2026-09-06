import PricingBottomCta from '@/components/membership/pricing-bottom-cta'
import PricingComparisonTable from '@/components/membership/pricing-comparison-table'
import PricingFaq from '@/components/membership/pricing-faq'
import PricingPlanCards from '@/components/membership/pricing-plan-cards'
import {
  PRICING_HEADLINE,
  PRICING_SUBHEADLINE,
  PRICING_SUPPORTING_LINE,
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
      </header>

      <div className="mt-12">
        <PricingPlanCards
          mode={mode}
          currentTier={currentTier}
          selectedPlan={selectedPlan}
          hasPaidStripeSubscription={hasPaidStripeSubscription}
        />
      </div>

      <PricingComparisonTable />
      <PricingFaq />
      <PricingBottomCta
        variant={mode === 'public' ? 'marketing' : 'club'}
        currentTier={currentTier}
        selectedPlan={selectedPlan}
        hasPaidStripeSubscription={hasPaidStripeSubscription}
      />
    </div>
  )
}
