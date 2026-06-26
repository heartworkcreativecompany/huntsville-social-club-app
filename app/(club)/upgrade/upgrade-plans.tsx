'use client'

import { useState, useTransition } from 'react'
import Card from '@/components/ui/card'
import PageHeader from '@/components/ui/page-header'
import { buttonPrimaryClassName } from '@/lib/event-labels'
import { INNER_CIRCLE_CREDITS_PER_PERIOD } from '@/lib/membership-tier-config'
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
          ? await upgradeToInnerCircle('monthly')
          : await upgradeToEliteCircle('monthly')

      if (result.error) {
        setMessage(result.error)
        return
      }

      setMessage(
        tier === 'inner'
          ? 'Welcome to Inner Circle — your billing period has reset with 3 fresh event credits.'
          : 'Welcome to Elite Circle — unlimited included registrations are now active.'
      )
    })
  }

  return (
    <>
      <PageHeader
        eyebrow="Membership"
        title="Upgrade your membership"
        description="Unlock messaging, Circle Socials, and included event registrations."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-accent/30">
          <p className="eyebrow">Inner Circle</p>
          <h2 className="text-display mt-1 text-2xl font-semibold">Inner Circle</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>Inner Circle badge</li>
            <li>Messaging enabled</li>
            <li>
              {INNER_CIRCLE_CREDITS_PER_PERIOD} included event registrations per
              billing period
            </li>
            <li>Credits work on standard events and Circle Socials</li>
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
            <li>Elite Circle badge and treatment</li>
            <li>Messaging enabled</li>
            <li>Unlimited included event registrations</li>
            <li>Standard events and Circle Socials included</li>
            <li>Premium concierge perks as they launch</li>
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
        Stripe checkout can replace these development upgrades when payment
        processing is connected. Upgrading to Inner Circle resets your billing
        period immediately and grants a fresh set of{' '}
        {INNER_CIRCLE_CREDITS_PER_PERIOD} credits.
      </p>
    </>
  )
}
