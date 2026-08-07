'use client'

import { useEffect, useState, useTransition } from 'react'
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
import {
  resolveGoingButtonClassName,
  resolveGoingButtonState,
  PREMIUM_RSVP_NO_REFUND_COPY,
} from '@/lib/event-rsvp-going'
import { PREMIUM_BUBBLE_GREY_CLASSNAME } from '@/lib/event-rsvp-window'
import type { MembershipPerksSnapshot } from '@/lib/event-rsvp-window'
import {
  applyRsvpResultToMemberPerksStore,
  getMemberPerksSnapshot,
} from '@/lib/member-perks-store'
import { formatFeeCents } from '@/lib/membership-tier-config'
import type { EventRegistrationDecision } from '@/lib/membership-tier-config'
import { FEATURE_GATE_COPY } from '@/lib/membership-pricing-copy'

export type RsvpSuccessPayload = {
  status?: RsvpStatus
  usedCredit?: boolean
  perks?: MembershipPerksSnapshot | null
}

type EventRsvpProps = {
  eventId: string
  eventStatus: string
  currentStatus?: string | null
  registrationPreview?: EventRegistrationDecision | null
  canRegisterGoing?: boolean
  atCapacityMessage?: string | null
  /** Event fee in cents — shown when Going will charge instead of using a credit. */
  feeCents?: number | null
  /** Compact premium bubble: grey RSVP card with fee/credit body copy. */
  premiumLayout?: boolean
  /** Called after a successful RSVP so Membership Perks can update credits. */
  onRsvpSuccess?: (result: RsvpSuccessPayload) => void
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
  feeCents = null,
  premiumLayout = false,
  onRsvpSuccess,
}: EventRsvpProps) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const [localStatus, setLocalStatus] = useState<string | null | undefined>(
    currentStatus
  )

  useEffect(() => {
    setLocalStatus(currentStatus)
  }, [currentStatus])

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

      // Paid path: redirect to Stripe. Do not treat this as a saved Going RSVP.
      const checkoutUrl =
        result && typeof result === 'object' && 'checkoutUrl' in result
          ? result.checkoutUrl
          : null
      if (typeof checkoutUrl === 'string' && checkoutUrl.length > 0) {
        setMessage('Redirecting to secure checkout…')
        window.location.assign(checkoutUrl)
        return
      }

      setLocalStatus(rsvpStatus)

      const usedCredit =
        result &&
        typeof result === 'object' &&
        'usedCredit' in result &&
        Boolean(result.usedCredit)
      const perks =
        result && typeof result === 'object' && 'perks' in result
          ? (result.perks as MembershipPerksSnapshot | null | undefined)
          : null

      // Apply shared perks store on the same path that shows the credit-used
      // message — before router.refresh() can race with stale RSC props.
      const before = getMemberPerksSnapshot()
      const after = applyRsvpResultToMemberPerksStore({
        usedCredit,
        perks: perks ?? null,
      })

      if (
        usedCredit &&
        (!perks ||
          typeof perks.premiumCreditsRemaining !== 'number' ||
          !perks.hasPaidMembership)
      ) {
        if (process.env.NODE_ENV !== 'production') {
          console.error(
            '[rsvp] usedCredit=true but perks snapshot missing/invalid',
            { perks, before, after }
          )
        }
      }

      onRsvpSuccess?.({
        status: rsvpStatus,
        usedCredit,
        perks: perks ?? null,
      })

      if (rsvpStatus === 'not_going' || rsvpStatus === 'maybe') {
        setMessage('RSVP updated.')
      } else if (usedCredit) {
        setMessage('RSVP saved. One premium credit was used.')
      } else {
        setMessage('RSVP saved.')
      }

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

  const willChargeEventFee =
    !!preview &&
    preview.allowed === true &&
    preview.method === 'paid_per_event' &&
    feeCents != null &&
    feeCents > 0

  const feeLabel =
    feeCents != null && feeCents > 0 ? `$${formatFeeCents(feeCents)}` : null

  const isPriorityLocked =
    preview && !preview.allowed && preview.code === 'priority_window'

  const isRegisteredGoing = localStatus === 'going'

  const buttons = (
    <div className="flex flex-wrap gap-2">
      {RSVP_OPTIONS.map((option) => {
        const isActive = localStatus === option.value
        const isGoingOption = option.value === 'going'
        const { goingBlocked, disabled } = isGoingOption
          ? resolveGoingButtonState({
              canRegisterGoing,
              currentStatus: localStatus,
              isPending,
            })
          : { goingBlocked: false, disabled: isPending }

        // Going uses primary only while selected (or as CTA when no RSVP yet).
        // After Not going / Maybe, Going returns to the secondary non-selected look.
        const className = isGoingOption
          ? resolveGoingButtonClassName({
              isActive,
              goingBlocked,
              hasExistingStatus: Boolean(localStatus),
              primaryClassName: buttonPrimaryClassName,
              secondaryClassName: buttonSecondaryClassName,
              disabledClassName: buttonDisabledMutedClassName,
            })
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

      {isPriorityLocked ? (
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
        <p className="mb-3 text-sm text-muted-foreground">
          {preview.description}
          {feeLabel ? ` Event fee: ${feeLabel}.` : ''}
        </p>
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

      {atCapacityMessage && localStatus !== 'going' ? (
        <div className="mb-4 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted-foreground">
          {atCapacityMessage}
        </div>
      ) : null}
    </>
  )

  if (premiumLayout) {
    return (
      <div className={PREMIUM_BUBBLE_GREY_CLASSNAME}>
        <p className="text-base font-semibold text-foreground">RSVP</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Going may use a premium membership credit or an event fee, depending
          on your membership and remaining credits.
        </p>
        {showStandardPaywall ? (
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            Premium events are available to free members by paying the event
            fee.
          </p>
        ) : null}
        {willChargeEventFee && feeLabel ? (
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            Going will take you to a secure checkout to pay the {feeLabel}{' '}
            event fee. Your RSVP is confirmed only after payment succeeds.
          </p>
        ) : null}
        {showStandardPaywall && !willChargeEventFee ? (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {preview.description}
          </p>
        ) : null}
        <div className="mt-4">{notices}</div>
        <div className="mt-4">{buttons}</div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {PREMIUM_RSVP_NO_REFUND_COPY}
        </p>
        {willChargeEventFee && !feeLabel ? (
          <p className="mt-2 text-xs text-muted-foreground">
            You&apos;ll be taken to a secure checkout to pay the event fee.
          </p>
        ) : null}
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
          : localStatus
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
