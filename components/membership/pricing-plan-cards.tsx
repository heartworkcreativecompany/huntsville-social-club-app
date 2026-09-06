'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Badge from '@/components/ui/badge'
import Card from '@/components/ui/card'
import {
  buttonPrimaryClassName,
  buttonSecondaryClassName,
} from '@/lib/event-labels'
import {
  PRICING_PLANS,
  type UpgradeModalVariant,
} from '@/lib/membership-pricing-copy'
import { MembershipCheckoutButton } from '@/components/membership/membership-billing-buttons'

type PlanKey = keyof typeof PRICING_PLANS

type PricingPlanCardsProps = {
  mode: 'public' | 'member'
  currentTier?: 'member' | 'connect' | 'inner_circle' | 'elite_circle'
}

export default function PricingPlanCards({
  mode,
  currentTier = 'member',
}: PricingPlanCardsProps) {
  const [message, setMessage] = useState('')

  const renderCta = (key: PlanKey) => {
    const plan = PRICING_PLANS[key]

    if (key === 'member') {
      return (
        <Link
          href={mode === 'public' ? '/signup' : '/dashboard'}
          className={buttonSecondaryClassName}
        >
          {plan.cta}
        </Link>
      )
    }

    if (mode === 'public') {
      return (
        <Link href="/signup" className={buttonPrimaryClassName}>
          {plan.cta}
        </Link>
      )
    }

    const isCurrent = key === currentTier

    if (isCurrent) {
      return (
        <span className="text-sm font-medium text-muted-foreground">
          Current plan
        </span>
      )
    }

    const disabled =
      (key === 'connect' &&
        (currentTier === 'inner_circle' || currentTier === 'elite_circle')) ||
      (key === 'inner_circle' && currentTier === 'elite_circle')

    return (
      <MembershipCheckoutButton
        tier={key}
        disabled={disabled}
        className={buttonPrimaryClassName}
      >
        {plan.cta}
      </MembershipCheckoutButton>
    )
  }

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
      {message ? (
        <p className="mt-6 text-sm text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
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
