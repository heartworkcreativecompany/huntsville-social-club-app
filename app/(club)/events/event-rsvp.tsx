'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  updateEventRsvp,
  type RsvpStatus,
} from '@/app/(club)/events/rsvp-actions'
import {
  buttonPrimaryClassName,
  buttonSecondaryClassName,
} from '@/lib/event-labels'
import type { EventRegistrationDecision } from '@/lib/membership-tier-config'
import { FEATURE_GATE_COPY } from '@/lib/membership-pricing-copy'
import { CircleSocialPaywall } from '@/components/membership/feature-paywalls'

type EventRsvpProps = {
  eventId: string
  eventStatus: string
  currentStatus?: string | null
  registrationPreview?: EventRegistrationDecision | null
  canRegisterGoing?: boolean
}

const RSVP_OPTIONS: { value: RsvpStatus; label: string }[] = [
  { value: 'going', label: 'Going' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'not_going', label: 'Not going' },
]

export default function EventRsvp({
  eventId,
  eventStatus,
  currentStatus,
  registrationPreview,
  canRegisterGoing = true,
}: EventRsvpProps) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const status = eventStatus ?? 'published'

  if (status !== 'published') {
    return (
      <p className="text-sm text-muted-foreground">
        RSVP is only available for published events.
      </p>
    )
  }

  const submitRsvp = (
    rsvpStatus: RsvpStatus,
    registrationPreference?: 'included' | 'paid'
  ) => {
    setMessage('')
    startTransition(async () => {
      const result = await updateEventRsvp({
        eventId,
        status: rsvpStatus,
        registrationPreference,
      })

      if (result.error) {
        setMessage(result.error)
        return
      }

      setMessage('RSVP saved.')
      router.refresh()
    })
  }

  const preview = registrationPreview
  const isCircleSocialBlocked =
    preview && !preview.allowed && preview.code === 'circle_social_blocked'

  const showInnerIncludedRemaining =
    preview?.allowed &&
    preview.uiState === 'inner_included_remaining' &&
    preview.method === 'credit'

  const showInnerIncludedExhausted =
    preview?.allowed && preview.uiState === 'inner_included_exhausted'

  const showStandardPaywall =
    preview?.allowed &&
    preview.method === 'paid_per_event' &&
    preview.uiState === 'member_paid'

  const showIncludedInfo =
    preview?.allowed &&
    (preview.uiState === 'elite_unlimited' ||
      preview.uiState === 'inner_circle_social_included')

  const isRegisteredGoing = currentStatus === 'going'

  return (
    <div>
      {isRegisteredGoing ? (
        <div className="mb-4 rounded-lg border border-accent/30 bg-accent-soft/40 p-4 text-sm">
          <p className="font-medium text-foreground">You&apos;re registered</p>
          <p className="mt-1 text-muted-foreground">
            You&apos;re going to this event. Update your RSVP below if your plans
            change.
          </p>
        </div>
      ) : null}

      {isCircleSocialBlocked ? <CircleSocialPaywall membershipsHref="/upgrade" /> : null}

      {showInnerIncludedRemaining && !isRegisteredGoing ? (
        <div className="mb-4 rounded-lg border border-accent/30 bg-accent-soft/40 p-4 text-sm">
          <p className="font-medium text-foreground">{preview.description}</p>
          <p className="mt-2 text-muted-foreground">
            {FEATURE_GATE_COPY.inner_included_remaining.supportingLine}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => submitRsvp('going', 'included')}
              className={buttonPrimaryClassName}
            >
              {FEATURE_GATE_COPY.inner_included_remaining.primaryCta}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => submitRsvp('going', 'paid')}
              className={buttonSecondaryClassName}
            >
              {FEATURE_GATE_COPY.inner_included_remaining.secondaryCta}
            </button>
          </div>
        </div>
      ) : null}

      {showInnerIncludedExhausted && !isRegisteredGoing ? (
        <div className="mb-4 rounded-lg border border-accent/30 bg-accent-soft/40 p-4 text-sm">
          <p className="font-medium text-foreground">
            {FEATURE_GATE_COPY.inner_included_exhausted.title}
          </p>
          <p className="mt-2 text-muted-foreground">
            {FEATURE_GATE_COPY.inner_included_exhausted.body}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => submitRsvp('going', 'paid')}
              className={buttonPrimaryClassName}
            >
              {FEATURE_GATE_COPY.inner_included_exhausted.primaryCta}
            </button>
            <Link href="/upgrade" className={buttonSecondaryClassName}>
              {FEATURE_GATE_COPY.inner_included_exhausted.secondaryCta}
            </Link>
          </div>
        </div>
      ) : null}

      {showStandardPaywall ? (
        <p className="mb-3 text-sm text-muted-foreground">{preview.description}</p>
      ) : null}

      {showIncludedInfo ? (
        <p className="mb-3 text-sm text-muted-foreground">{preview.description}</p>
      ) : null}

      {preview && !preview.allowed && !isCircleSocialBlocked ? (
        <div className="mb-4 rounded-lg border border-accent/30 bg-accent-soft/40 p-3 text-sm">
          <p className="text-muted-foreground">{preview.message}</p>
          {preview.upgradeTier ? (
            <Link
              href="/upgrade"
              className="mt-2 inline-block font-medium text-accent underline"
            >
              View membership options →
            </Link>
          ) : null}
        </div>
      ) : null}

      <p className="mb-3 text-sm text-muted-foreground">
        {isRegisteredGoing ? 'Change your RSVP' : currentStatus ? 'Your RSVP' : 'RSVP to this event'}
      </p>
      <div className="flex flex-wrap gap-2">
        {RSVP_OPTIONS.map((option) => {
          const isActive = currentStatus === option.value
          const hideGoingForInnerChoice =
            option.value === 'going' &&
            (showInnerIncludedRemaining || showInnerIncludedExhausted)
          const disabled =
            isPending ||
            hideGoingForInnerChoice ||
            (option.value === 'going' && !canRegisterGoing && currentStatus !== 'going')

          if (hideGoingForInnerChoice) return null

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => submitRsvp(option.value)}
              disabled={disabled}
              className={`${buttonSecondaryClassName} ${
                isActive
                  ? 'border-accent bg-accent text-accent-foreground'
                  : ''
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      {message ? (
        <p className="mt-2 text-sm text-muted-foreground" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  )
}
