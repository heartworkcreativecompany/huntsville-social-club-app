'use client'

import { useState, useTransition } from 'react'
import Card from '@/components/ui/card'
import PageHeader from '@/components/ui/page-header'
import { buttonPrimaryClassName } from '@/lib/event-labels'
import {
  ELITE_CIRCLE_GUEST_INVITES_PER_PERIOD,
  ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD,
  INNER_CIRCLE_CIRCLE_SOCIAL_CREDITS_PER_PERIOD,
  INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD,
} from '@/lib/membership-tier-config'
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
          ? `Welcome to Inner Circle — your billing period includes ${INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD} premium event credit and ${INNER_CIRCLE_CIRCLE_SOCIAL_CREDITS_PER_PERIOD} Circle Social credits.`
          : `Welcome to Elite Circle — ${ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD} premium credits and ${ELITE_CIRCLE_GUEST_INVITES_PER_PERIOD} guest invite are now active.`
      )
    })
  }

  return (
    <>
      <PageHeader
        eyebrow="Membership"
        title="Upgrade your membership"
        description="Unlock messaging, Circle Social credits, premium event credits, and more."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-accent/30">
          <p className="eyebrow">Inner Circle</p>
          <h2 className="text-display mt-1 text-2xl font-semibold">Inner Circle</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>Inner Circle badge</li>
            <li>Messaging enabled</li>
            <li>
              {INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD} included premium event
              credit per billing period
            </li>
            <li>
              {INNER_CIRCLE_CIRCLE_SOCIAL_CREDITS_PER_PERIOD} included Circle
              Social credits per billing period
            </li>
            <li>Create standard events (admin approval required)</li>
            <li>Unused credits expire each cycle — no rollover</li>
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
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>Everything in Inner Circle</li>
            <li>
              {ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD} premium event credits per
              billing period
            </li>
            <li>All Circle Socials are included in your membership.</li>
            <li>
              {ELITE_CIRCLE_GUEST_INVITES_PER_PERIOD} guest invite per billing
              period
            </li>
            <li>Priority RSVP for premium events and Circle Socials</li>
            <li>Eligible to apply for a Business Directory listing</li>
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
        Stripe Checkout grants access after webhook confirmation. Upgrading
        resets your billing period and grants a fresh credit/guest allotment.
      </p>
    </>
  )
}
