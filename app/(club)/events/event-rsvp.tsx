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
import { resolveGoingButtonState } from '@/lib/event-rsvp-going'
import type { EventRegistrationDecision } from '@/lib/membership-tier-config'
import { FEATURE_GATE_COPY } from '@/lib/membership-pricing-copy'

type EventRsvpProps = {
  eventId: string
  eventStatus: string
  currentStatus?: string | null
  registrationPreview?: EventRegistrationDecision | null
  canRegisterGoing?: boolean
  atCapacityMessage?: string | null
  /** Compact premium bubble: gold RSVP header + fee/credit body copy. */
  premiumLayout?: boolean
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
  premiumLayout = false,
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

  const buttons = (
    <div className="flex flex-wrap gap-2">
      {RSVP_OPTIONS.map((option) => {
        const isActive = currentStatus === option.value
        const isGoingOption = option.value === 'going'
        const { goingBlocked, disabled } = isGoingOption
          ? resolveGoingButtonState({
              canRegisterGoing,
              currentStatus,
              isPending,
            })
          : { goingBlocked: false, disabled: isPending }

        if (
          process.env.NODE_ENV === 'development' &&
          isGoingOption
        ) {
          // eslint-disable-next-line no-console
          console.debug('[event-rsvp] Going state', {
            canRegisterGoing,
            goingBlocked,
            disabled,
            currentStatus,
            previewAllowed: preview?.allowed,
          })
        }

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
            onClick={() => {
              if (option.value === 'going' && showInnerIncludedRemaining) {
                submitRsvp('going', 'included')
                return
              }
              if (option.value === 'going' && showInnerIncludedExhausted) {
                submitRsvp('going', 'paid')
                return
              }
              submitRsvp(option.value)
            }}
            disabled={disabled}
            aria-pressed={isActive}
            className={className}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )

  const notices = (
    <>
      {isRegisteredGoing && !premiumLayout ? (
        <div className="mb-4 rounded-lg border border-accent/30 bg-accent-soft/40 p-4 text-sm">
          <p className="font-medium text-foreground">You&apos;re registered</p>
          <p className="mt-1 text-muted-foreground">
            You&apos;re going to this event. Update your RSVP below if your plans
            change.
          </p>
        </div>
      ) : null}

      {isPriorityLocked && !premiumLayout ? (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning-soft/40 p-4 text-sm">
          <p className="font-medium text-foreground">Priority RSVP window</p>
          <p className="mt-1 text-muted-foreground">
            {preview && !preview.allowed
              ? preview.message
              : 'Elite Circle has priority access right now.'}
          </p>
        </div>
      ) : null}

      {showInnerIncludedRemaining && !isRegisteredGoing && !premiumLayout ? (
        <div className="mb-4 rounded-lg border border-accent/30 bg-accent-soft/40 p-4 text-sm">
          <p className="font-medium text-foreground">{preview.description}</p>
          <p className="mt-2 text-muted-foreground">
            {FEATURE_GATE_COPY.inner_included_remaining.supportingLine}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
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

      {showInnerIncludedExhausted && !isRegisteredGoing && !premiumLayout ? (
        <div className="mb-4 rounded-lg border border-accent/30 bg-accent-soft/40 p-4 text-sm">
          <p className="font-medium text-foreground">
            {FEATURE_GATE_COPY.inner_included_exhausted.title}
          </p>
          <p className="mt-2 text-muted-foreground">
            {FEATURE_GATE_COPY.inner_included_exhausted.body}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/upgrade" className={buttonSecondaryClassName}>
              {FEATURE_GATE_COPY.inner_included_exhausted.secondaryCta}
            </Link>
          </div>
        </div>
      ) : null}

      {showStandardPaywall ? (
        <p className="mb-3 text-sm text-muted-foreground">{preview.description}</p>
      ) : null}

      {showIncludedInfo && !premiumLayout ? (
        <p className="mb-3 text-sm text-muted-foreground">{preview.description}</p>
      ) : null}

      {preview &&
      !preview.allowed &&
      preview.code !== 'priority_window' ? (
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
    </>
  )

  if (premiumLayout) {
    return (
      <div className="mb-6 rounded-2xl border-2 border-accent bg-accent-soft/15 px-5 py-4">
        <p className="text-base font-semibold text-accent">RSVP</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Going may use a premium membership credit or an event fee, depending
          on your membership and remaining credits.
        </p>
        <div className="mt-4">{notices}</div>
        <div className="mt-4">{buttons}</div>
        {message ? (
          <p className="mt-2 text-sm text-muted-foreground" role="alert">
            {message}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div>
      {notices}
      <p className="mb-3 text-sm text-muted-foreground">
        {isRegisteredGoing
          ? 'Change your RSVP'
          : currentStatus
            ? 'Your RSVP'
            : 'RSVP to this event'}
      </p>
      {buttons}
      {message ? (
        <p className="mt-2 text-sm text-muted-foreground" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  )
}
