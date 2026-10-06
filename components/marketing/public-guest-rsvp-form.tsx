'use client'

import { useEffect, useId, useRef, useState } from 'react'
import {
  inputClassName,
  marketingButtonPrimaryClassName,
  textareaClassName,
} from '@/lib/event-labels'
import { startGuestEventCheckout } from '@/lib/guest-event-checkout'
import {
  beginGuestCheckout,
  guestRsvpButtonLabel,
  spotsLeftLabel,
  type GuestRsvpFieldErrors,
} from '@/lib/public-guest-rsvp'

const paymentButtonClassName = `${marketingButtonPrimaryClassName} w-full sm:w-auto`

export default function PublicGuestRsvpForm({
  eventId,
  priceLabel,
  rsvpQuestion,
  rsvpQuestionRequired,
  spotsLeft,
}: {
  eventId: string
  priceLabel: string
  rsvpQuestion: string | null
  rsvpQuestionRequired: boolean
  spotsLeft: number | null
}) {
  const formId = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [rsvpAnswer, setRsvpAnswer] = useState('')
  const [website, setWebsite] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<GuestRsvpFieldErrors>({})
  const [formMessage, setFormMessage] = useState<string | null>(null)
  const spots = spotsLeftLabel(spotsLeft)

  useEffect(() => {
    if (open) nameRef.current?.focus()
  }, [open])
  const nameId = `${formId}-name`
  const emailId = `${formId}-email`
  const answerId = `${formId}-answer`
  const websiteId = `${formId}-website`

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setFieldErrors({})
    setFormMessage(null)

    const outcome = await beginGuestCheckout(
      {
        eventId,
        fullName,
        email,
        rsvpAnswer,
        website,
        rsvpQuestionRequired,
      },
      startGuestEventCheckout
    )

    if (outcome.type === 'redirect') {
      window.location.assign(outcome.url)
      return
    }

    if (outcome.type === 'fields') {
      setFieldErrors(outcome.errors)
    } else {
      setFormMessage(outcome.message)
    }
    setSubmitting(false)
  }

  return (
    <div className="mt-6">
      {spots ? (
        <p className="mb-3 text-sm text-muted-foreground">{spots}</p>
      ) : null}
      {open ? null : (
        <button
          type="button"
          className={paymentButtonClassName}
          aria-expanded={false}
          onClick={() => setOpen(true)}
        >
          {guestRsvpButtonLabel(priceLabel)}
        </button>
      )}
      {open ? (
        <form
          className="relative grid max-w-lg gap-4"
          onSubmit={onSubmit}
          noValidate
        >
          <div className="grid gap-1.5">
            <label htmlFor={nameId} className="text-sm font-medium text-foreground">
              Full name
            </label>
            <input
              ref={nameRef}
              id={nameId}
              name="fullName"
              type="text"
              autoComplete="name"
              required
              maxLength={120}
              value={fullName}
              aria-invalid={fieldErrors.fullName ? true : undefined}
              aria-describedby={fieldErrors.fullName ? `${nameId}-error` : undefined}
              className={inputClassName}
              onChange={(event) => setFullName(event.target.value)}
            />
            {fieldErrors.fullName ? (
              <p id={`${nameId}-error`} className="text-sm text-accent" role="alert">
                {fieldErrors.fullName}
              </p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <label htmlFor={emailId} className="text-sm font-medium text-foreground">
              Email
            </label>
            <input
              id={emailId}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              maxLength={320}
              value={email}
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? `${emailId}-error` : undefined}
              className={inputClassName}
              onChange={(event) => setEmail(event.target.value)}
            />
            {fieldErrors.email ? (
              <p id={`${emailId}-error`} className="text-sm text-accent" role="alert">
                {fieldErrors.email}
              </p>
            ) : null}
          </div>

          {rsvpQuestion ? (
            <div className="grid gap-1.5">
              <label htmlFor={answerId} className="text-sm font-medium text-foreground">
                {rsvpQuestion}
              </label>
              <textarea
                id={answerId}
                name="rsvpAnswer"
                required={rsvpQuestionRequired}
                maxLength={300}
                value={rsvpAnswer}
                aria-required={rsvpQuestionRequired || undefined}
                aria-invalid={fieldErrors.rsvpAnswer ? true : undefined}
                aria-describedby={
                  fieldErrors.rsvpAnswer ? `${answerId}-error` : undefined
                }
                className={textareaClassName}
                onChange={(event) => setRsvpAnswer(event.target.value)}
              />
              {fieldErrors.rsvpAnswer ? (
                <p id={`${answerId}-error`} className="text-sm text-accent" role="alert">
                  {fieldErrors.rsvpAnswer}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="absolute h-0 w-0 overflow-hidden" aria-hidden="true">
            <label htmlFor={websiteId}>Website</label>
            <input
              id={websiteId}
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </div>

          {fieldErrors.form ? (
            <p className="text-sm text-accent" role="alert">
              {fieldErrors.form}
            </p>
          ) : null}
          {formMessage ? (
            <p className="text-sm text-foreground" role="alert">
              {formMessage}
            </p>
          ) : null}

          <div>
            <button
              type="submit"
              className={paymentButtonClassName}
              disabled={submitting}
            >
              Continue to payment
            </button>
            <p className="mt-3 text-sm text-muted-foreground">
              {"You'll pay securely with Stripe. Members can sign in to use a credit."}
            </p>
          </div>
        </form>
      ) : null}
    </div>
  )
}
