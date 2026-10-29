'use client'

import { useState, useTransition } from 'react'
import Card from '@/components/ui/card'
import PageHeader from '@/components/ui/page-header'
import { buttonPrimaryClassName } from '@/lib/event-labels'
import { PRICING_PLANS } from '@/lib/membership-pricing-copy'
import {
  upgradeToEliteCircle,
  upgradeToInnerCircle,
} from '@/app/(club)/membership/actions'

export default function UpgradePlans() {
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleUpgrade = (tier: 'inner' | 'elite') => {
    setMessage('')
    startTransition(async () => {
      const result =
        tier === 'inner'
          ? await upgradeToInnerCircle()
          : await upgradeToEliteCircle()

      if (result.error) {
        setMessage(result.error)
        return
      }

      setMessage(
        tier === 'inner'
          ? 'Welcome to Inner Circle. This membership includes no Circle Social credits, premium-event credits, or guest invitations.'
          : 'Welcome to Elite Circle. This membership includes 1 premium-event credit and 2 Circle Social credits per billing cycle, and no guest invitations.'
      )
    })
  }

  return (
    <>
      <PageHeader
        eyebrow="Membership"
        title="Upgrade your membership"
        description="Inner Circle adds compatibility recommendations. Elite Circle adds Circle Social credits, a premium-event credit, priority RSVP, and Business Directory application eligibility. Messaging requires approval and accepted identity on every plan."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-accent/30">
          <p className="eyebrow">Inner Circle</p>
          <h2 className="text-display mt-1 text-2xl font-semibold">
            Inner Circle
          </h2>
          <p className="mt-2 text-sm font-medium text-foreground">
            {PRICING_PLANS.inner_circle.price}
          </p>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            {PRICING_PLANS.inner_circle.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleUpgrade('inner')}
            className={`${buttonPrimaryClassName} mt-6`}
          >
            {isPending ? 'Upgrading…' : 'Upgrade to Inner Circle'}
          </button>
        </Card>

        <Card className="border-accent/40 bg-gradient-to-br from-accent-soft/50 to-surface">
          <p className="eyebrow">Elite Circle</p>
          <h2 className="text-display mt-1 text-2xl font-semibold">Elite Circle</h2>
          <p className="mt-2 text-sm font-medium text-foreground">
            {PRICING_PLANS.elite_circle.price}
          </p>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            {PRICING_PLANS.elite_circle.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleUpgrade('elite')}
            className={`${buttonPrimaryClassName} mt-6`}
          >
            {isPending ? 'Upgrading…' : 'Upgrade to Elite Circle'}
          </button>
        </Card>
      </div>

      {message ? (
        <p className="mt-6 text-sm text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}

      <p className="mt-8 text-xs text-muted">
        Stripe Checkout grants access after webhook confirmation. A new purchase
        uses the current membership offer. An existing subscription keeps its
        current price and issued benefits until that subscription is changed.
      </p>
    </>
  )
}
