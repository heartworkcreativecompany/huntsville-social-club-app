import {
  BOTTOM_CTA,
} from '@/lib/membership-pricing-copy'
import MembershipPlanCta from '@/components/membership/membership-plan-cta'
import {
  buttonPrimaryClassName,
  buttonSecondaryClassName,
  marketingButtonPrimaryClassName,
  marketingButtonSecondaryClassName,
} from '@/lib/event-labels'
import type { PricingPlanKey, PricingSurfaceMode } from '@/lib/membership-plan-links'

const PLAN_KEYS = [
  'member',
  'connect',
  'inner_circle',
  'elite_circle',
] as const satisfies readonly PricingPlanKey[]

export default function PricingBottomCta({
  variant = 'club',
  currentTier = 'member',
  selectedPlan = null,
}: {
  variant?: 'club' | 'marketing'
  currentTier?: PricingPlanKey
  selectedPlan?: Exclude<PricingPlanKey, 'member'> | null
}) {
  const mode: PricingSurfaceMode = variant === 'marketing' ? 'public' : 'member'
  const primary =
    variant === 'marketing' ? marketingButtonPrimaryClassName : buttonPrimaryClassName
  const secondary =
    variant === 'marketing' ? marketingButtonSecondaryClassName : buttonSecondaryClassName

  return (
    <section className="mt-16 rounded-xl border border-accent/30 bg-accent-soft/30 p-8 text-center sm:p-10">
      <h2 className="text-display text-2xl font-semibold sm:text-3xl">
        {BOTTOM_CTA.headline}
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
        {BOTTOM_CTA.subtext}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {PLAN_KEYS.map((key) => (
          <MembershipPlanCta
            key={key}
            planKey={key}
            mode={mode}
            currentTier={currentTier}
            className={key === 'member' ? secondary : primary}
            selected={selectedPlan === key}
          />
        ))}
      </div>
    </section>
  )
}
