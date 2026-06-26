/**
 * Configurable membership product rules — single source of truth for cutoffs.
 */

/** Inner Circle included free registrations per billing period. */
export const INNER_CIRCLE_FREE_REGISTRATIONS_PER_PERIOD = 3

/** @deprecated Use INNER_CIRCLE_FREE_REGISTRATIONS_PER_PERIOD */
export const INNER_CIRCLE_CREDITS_PER_PERIOD = INNER_CIRCLE_FREE_REGISTRATIONS_PER_PERIOD

/** Days before event start — cancellations inside this window do not return a free registration. */
export const FREE_REGISTRATION_RETURN_CUTOFF_DAYS = 5

/** @deprecated Use FREE_REGISTRATION_RETURN_CUTOFF_DAYS */
export const CREDIT_RETURN_CUTOFF_DAYS = FREE_REGISTRATION_RETURN_CUTOFF_DAYS

/** When true, cancellations earlier than the cutoff return a consumed free registration. */
export const RETURN_FREE_REGISTRATION_BEFORE_CUTOFF = true

/** @deprecated Use RETURN_FREE_REGISTRATION_BEFORE_CUTOFF */
export const RETURN_CREDIT_BEFORE_CUTOFF = RETURN_FREE_REGISTRATION_BEFORE_CUTOFF

export const PRODUCT_TIER_LABELS = {
  member: 'Member',
  inner_circle: 'Inner Circle',
  elite_circle: 'Elite Circle',
} as const

export type ProductTier = keyof typeof PRODUCT_TIER_LABELS

export const PAID_PRODUCT_TIERS: ProductTier[] = ['inner_circle', 'elite_circle']

export type EventAccessType = 'standard_event' | 'circle_social'

export const EVENT_ACCESS_LABELS: Record<EventAccessType, string> = {
  standard_event: 'Standard Event',
  circle_social: 'Circle Social',
}

export type RegistrationMethod =
  | 'paid_per_event'
  | 'credit'
  | 'included_unlimited'

export type RegistrationUiState =
  | 'member_paid'
  | 'inner_included_remaining'
  | 'inner_included_exhausted'
  | 'inner_circle_social_included'
  | 'elite_unlimited'

export type EventRegistrationDecision =
  | {
      allowed: false
      code:
        | 'not_approved'
        | 'circle_social_blocked'
        | 'payment_required'
        | 'subscription_inactive'
        | 'event_closed'
      message: string
      upgradeTier?: 'inner_circle' | 'elite_circle'
    }
  | {
      allowed: true
      method: RegistrationMethod
      freeRegistrationsRemaining?: number
      freeRegistrationsGranted?: number
      paymentRequired?: boolean
      includedUnlimited?: boolean
      circleSocialIncluded?: boolean
      canPayInsteadOfIncluded?: boolean
      uiState?: RegistrationUiState
      label: string
      description: string
    }
