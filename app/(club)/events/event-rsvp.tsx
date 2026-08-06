'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  updateEventRsvp,
  type RsvpStatus,
} from '@/app/(club)/events/rsvp-actions'
import {
  buttonDisabledMutedClassName,
  buttonPrimaryClassName,
  buttonSecondaryClassName,
} from '@/lib/event-labels'
import type { EventRegistrationDecision } from '@/lib/membership-tier-config'
import { FEATURE_GATE_COPY } from '@/lib/membership-pricing-copy'

type EventRsvpProps = {
  eventId: string
  eventStatus: string
  currentStatus?: string | null
  registrationPreview?: EventRegistrationDecision | null
  canRegisterGoing?: boolean
  atCapacityMessage?: string | null
  /** Membership credit / guest summary for premium events (shown in RSVP). */
  creditSummary?: string | null
  eventType?: string | null
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
  atCapacityMessage = null,
  creditSummary = null,
  eventType = null,
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

  const showInnerIncludedRemaining =
    preview?.allowed &&
    (preview.uiState === 'inner_premium_credit_remaining' ||
      preview.uiState === 'elite_premium_credit_remaining') &&
    preview.method === 'credit'

  const showInnerIncludedExhausted =
    preview?.allowed &&
    (preview.uiState === 'inner_premium_credit_exhausted' ||
      preview.uiState === 'elite_premium_credit_exhausted')

  const showStandardPaywall =
    preview?.allowed &&
    preview.method === 'paid_per_event' &&
    preview.uiState === 'member_paid'

  const showIncludedInfo =
    preview?.allowed &&
    (preview.uiState === 'elite_circle_social_included' ||
      preview.uiState === 'inner_circle_social_included' ||
      preview.uiState === 'member_standard_free')

  const isPriorityLocked =
    preview && !preview.allowed && preview.code === 'priority_window'

  const isRegisteredGoing = currentStatus === 'going'

  return (
    <div>
      {creditSummary ? (
        <div className="mb-4 rounded-lg border border-border bg-surface-elevated/60 px-3 py-3 text-sm">
          <p className="text-foreground">{creditSummary}</p>
          {eventType === 'premium_event' ? (
            <p className="mt-1 text-muted-foreground">
              Going may use a premium membership credit or the event fee,
              depending on your membership and remaining credits.
            </p>
          ) : null}
        </div>
      ) : null}

      {isRegisteredGoing ? (
        <div className="mb-4 rounded-lg border border-accent/30 bg-accent-soft/40 p-4 text-sm">
          <p className="font-medium text-foreground">You&apos;re registered</p>
          <p className="mt-1 text-muted-foreground">
            You&apos;re going to this event. Update your RSVP below if your plans
            change.
          </p>
        </div>
      ) : null}

      {isPriorityLocked ? (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning-soft/40 p-4 text-sm">
          <p className="font-medium text-foreground">Priority RSVP window</p>
          <p className="mt-1 text-muted-foreground">
            {preview && !preview.allowed ? preview.message : 'Elite Circle has priority access right now.'}
          </p>
        </div>
      ) : null}

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

      {preview && !preview.allowed && preview.code !== 'priority_window' ? (
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

      {atCapacityMessage && currentStatus !== 'going' ? (
        <div className="mb-4 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted-foreground">
          {atCapacityMessage}
        </div>
      ) : null}

      <p className="mb-3 text-sm text-muted-foreground">
        {isRegisteredGoing ? 'Change your RSVP' : currentStatus ? 'Your RSVP' : 'RSVP to this event'}
      </p>
      <div className="flex flex-wrap gap-2">
        {RSVP_OPTIONS.map((option) => {
          const isActive = currentStatus === option.value
          const isGoingOption = option.value === 'going'
          const hideGoingForInnerChoice =
            isGoingOption &&
            (showInnerIncludedRemaining || showInnerIncludedExhausted)
          const goingBlocked =
            isGoingOption && !canRegisterGoing && currentStatus !== 'going'
          const disabled = isPending || hideGoingForInnerChoice || goingBlocked

          if (hideGoingForInnerChoice) return null

          const className = goingBlocked
            ? buttonDisabledMutedClassName
            : isGoingOption
              ? buttonPrimaryClassName
              : isActive
                ? `${buttonSecondaryClassName} border-accent bg-accent text-accent-foreground hover:brightness-110`
                : buttonSecondaryClassName

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => submitRsvp(option.value)}
              disabled={disabled}
              aria-pressed={isActive}
              className={className}
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
