'use client'

import { useTransition } from 'react'
import { buttonPrimaryClassName, buttonSecondaryClassName } from '@/lib/event-labels'
import {
  createBillingPortalSession,
  createMembershipCheckoutSession,
} from '@/app/(club)/membership/actions'
import type { PaidMembershipTier } from '@/lib/stripe/config'

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

  return (
    <button
      type="button"
      disabled={disabled || isPending}
      className={className}
      onClick={() => {
        startTransition(async () => {
          const result = await createMembershipCheckoutSession(tier)
          if (result.error) {
            alert(result.error)
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

  return (
    <button
      type="button"
      disabled={isPending}
      className={className}
      onClick={() => {
        startTransition(async () => {
          const result = await createBillingPortalSession()
          if (result.error) {
            alert(result.error)
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
  )
}
