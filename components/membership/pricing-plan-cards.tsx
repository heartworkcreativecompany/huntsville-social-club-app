'use client'

import Badge from '@/components/ui/badge'
import Card from '@/components/ui/card'
import MembershipPlanCta from '@/components/membership/membership-plan-cta'
import {
  buttonPrimaryClassName,
  buttonSecondaryClassName,
} from '@/lib/event-labels'
import {
  PRICING_PLANS,
  type UpgradeModalVariant,
} from '@/lib/membership-pricing-copy'
import type { PricingPlanKey } from '@/lib/membership-plan-links'

type PlanKey = PricingPlanKey

type PricingPlanCardsProps = {
  mode: 'public' | 'member'
  currentTier?: PlanKey
  selectedPlan?: Exclude<PlanKey, 'member'> | null
}

export default function PricingPlanCards({
  mode,
  currentTier = 'member',
  selectedPlan = null,
}: PricingPlanCardsProps) {
  const renderCta = (key: PlanKey) => (
    <MembershipPlanCta
      planKey={key}
      mode={mode}
      currentTier={currentTier}
      className={key === 'member' ? buttonSecondaryClassName : buttonPrimaryClassName}
      selected={selectedPlan === key}
    />
  )

  const plans: PlanKey[] = ['member', 'connect', 'inner_circle', 'elite_circle']

  return (
    <>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((key) => {
          const plan = PRICING_PLANS[key]
          const highlighted = key === 'inner_circle'

          return (
            <Card
              key={key}
              className={`flex h-full flex-col ${
                highlighted
                  ? 'border-accent/50 bg-gradient-to-b from-accent-soft/40 to-surface ring-1 ring-accent/30'
                  : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="eyebrow">{plan.name}</p>
                {'badge' in plan && plan.badge ? (
                  <Badge variant="accent">{plan.badge}</Badge>
                ) : null}
              </div>
              <h2 className="text-display mt-2 text-2xl font-semibold">
                {plan.name}
              </h2>
              <p className="mt-2 text-2xl font-semibold text-accent">
                {plan.price}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                {plan.description}
              </p>
              <ul className="mt-5 flex-1 space-y-2 text-sm text-muted-foreground">
                {plan.bullets.map((bullet) => (
                  <li key={bullet} className="flex gap-2">
                    <span className="text-accent" aria-hidden>
                      ·
                    </span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6">{renderCta(key)}</div>
            </Card>
          )
        })}
      </div>
    </>
  )
}

export function upgradeVariantForTier(
  currentTier: 'member' | 'connect' | 'inner_circle' | 'elite_circle',
  target: 'connect' | 'inner_circle' | 'elite_circle'
): UpgradeModalVariant | null {
  if (currentTier === 'elite_circle') return null
  if (target === 'inner_circle' && (currentTier === 'member' || currentTier === 'connect')) {
    return 'free_to_inner'
  }
  if (target === 'elite_circle' && (currentTier === 'member' || currentTier === 'connect')) {
    return 'free_to_elite'
  }
  if (target === 'elite_circle' && currentTier === 'inner_circle') {
    return 'inner_to_elite'
  }
  return null
}
