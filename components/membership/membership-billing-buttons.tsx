'use client'

import { useState, useTransition } from 'react'
import { buttonPrimaryClassName, buttonSecondaryClassName } from '@/lib/event-labels'
import {
  createBillingPortalSession,
  createMembershipCheckoutSession,
} from '@/app/(club)/membership/actions'
import type { PaidMembershipTier } from '@/lib/stripe/config'

function BillingActionError({ message }: { message: string }) {
  return (
    <p className="max-w-xs text-sm text-danger" role="alert">
      {message}
    </p>
  )
}

export function MembershipCheckoutButton({
  tier,
  children,
  className = buttonPrimaryClassName,
  disabled = false,
}: {
  tier: PaidMembershipTier
  children: React.ReactNode
  className?: string
  disabled?: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  return (
    <span className="inline-flex flex-col items-center gap-2">
      <button
        type="button"
        data-membership-cta="checkout"
        disabled={disabled || isPending}
        className={className}
        onClick={() => {
          setError('')
          startTransition(async () => {
            const result = await createMembershipCheckoutSession(tier)
            if (result.error) {
              setError(result.error)
              return
            }
            if (result.url) {
              window.location.href = result.url
            }
          })
        }}
      >
        {isPending ? 'Redirecting…' : children}
      </button>
      {error ? <BillingActionError message={error} /> : null}
    </span>
  )
}

export function BillingPortalButton({
  className = buttonSecondaryClassName,
  children = 'Manage billing',
}: {
  className?: string
  children?: React.ReactNode
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  return (
    <span className="inline-flex flex-col items-center gap-2">
      <button
        type="button"
        data-membership-cta="portal"
        disabled={isPending}
        className={className}
        onClick={() => {
          setError('')
          startTransition(async () => {
            const result = await createBillingPortalSession()
            if (result.error) {
              setError(result.error)
              return
            }
            if (result.url) {
              window.location.href = result.url
            }
          })
        }}
      >
        {isPending ? 'Opening…' : children}
      </button>
      {error ? <BillingActionError message={error} /> : null}
    </span>
  )
}
