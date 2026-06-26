'use client'

import Link from 'next/link'
import Card from '@/components/ui/card'
import {
  buttonPrimaryClassName,
  buttonSecondaryClassName,
} from '@/lib/event-labels'
import {
  FEATURE_GATE_COPY,
  type UpgradeModalVariant,
  UPGRADE_MODALS,
} from '@/lib/membership-pricing-copy'
import { createMembershipCheckoutSession } from '@/app/(club)/membership/actions'
import { useState, useTransition } from 'react'

type UpgradePromptProps = {
  variant: UpgradeModalVariant
  membershipsHref?: string
  onDismiss?: () => void
  className?: string
}

export function UpgradePrompt({
  variant,
  membershipsHref = '/pricing',
  onDismiss,
  className = '',
}: UpgradePromptProps) {
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const copy = UPGRADE_MODALS[variant]

  const targetTier =
    variant === 'free_to_inner' ? 'inner_circle' : 'elite_circle'

  const handlePrimary = () => {
    setMessage('')
    startTransition(async () => {
      const result = await createMembershipCheckoutSession(targetTier)
      if (result.error) {
        setMessage(result.error)
        return
      }
      if (result.url) {
        window.location.href = result.url
        return
      }
      onDismiss?.()
    })
  }

  return (
    <Card className={className}>
      <p className="eyebrow">Membership</p>
      <h2 className="text-display mt-1 text-lg font-semibold">{copy.title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {copy.body}
      </p>
      <ul className="mt-4 list-inside list-disc space-y-1.5 text-sm text-muted-foreground">
        {copy.bullets.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={handlePrimary}
          className={buttonPrimaryClassName}
        >
          {isPending ? 'Processing…' : copy.primaryCta}
        </button>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className={buttonSecondaryClassName}
          >
            {copy.secondaryCta}
          </button>
        ) : variant === 'inner_to_elite' ? (
          <Link href="/profile" className={buttonSecondaryClassName}>
            {copy.secondaryCta}
          </Link>
        ) : (
          <Link href="/members" className={buttonSecondaryClassName}>
            {copy.secondaryCta}
          </Link>
        )}
      </div>
      {message ? (
        <p className="mt-3 text-sm text-muted-foreground" role="alert">
          {message}
        </p>
      ) : null}
    </Card>
  )
}

export function MessagingPaywall({
  membershipsHref = '/pricing',
}: {
  membershipsHref?: string
}) {
  const copy = FEATURE_GATE_COPY.messaging

  return (
    <Card>
      <p className="eyebrow">Messaging</p>
      <h2 className="text-display mt-1 text-lg font-semibold">{copy.title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {copy.body}
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href="/upgrade" className={buttonPrimaryClassName}>
          {copy.primaryCta}
        </Link>
        <Link href={membershipsHref} className={buttonSecondaryClassName}>
          {copy.secondaryCta}
        </Link>
      </div>
    </Card>
  )
}

export function CircleSocialPaywall({
  membershipsHref = '/pricing',
}: {
  membershipsHref?: string
}) {
  const copy = FEATURE_GATE_COPY.circle_social

  return (
    <Card className="mb-4 border-accent/30 bg-accent-soft/40">
      <p className="eyebrow">Circle Social</p>
      <h3 className="text-display mt-1 text-base font-semibold">{copy.title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{copy.body}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/upgrade" className={buttonPrimaryClassName}>
          {copy.primaryCta}
        </Link>
        <Link href={membershipsHref} className={buttonSecondaryClassName}>
          {copy.secondaryCta}
        </Link>
      </div>
    </Card>
  )
}
