/**
 * Configurable membership product rules — single source of truth.
 */

/** Inner Circle included premium event credits per billing period. */
export const INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD = 1

/** Elite Circle included premium event credits per billing period. */
export const ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD = 2

/** Elite Circle guest invites per billing period. */
export const ELITE_CIRCLE_GUEST_INVITES_PER_PERIOD = 1

/** Days before event start — cancellations inside this window do not return a premium credit. */
export const FREE_REGISTRATION_RETURN_CUTOFF_DAYS = 5

/** When true, cancellations earlier than the cutoff return a consumed premium credit. */
export const RETURN_FREE_REGISTRATION_BEFORE_CUTOFF = true

/** Event sponsorship package price (cents). One-time per event, not monthly. */
export const EVENT_SPONSORSHIP_AMOUNT_CENTS = 49_900

/** Short customer-facing sponsorship price, e.g. "$499". */
export const EVENT_SPONSORSHIP_PRICE_LABEL = `$${EVENT_SPONSORSHIP_AMOUNT_CENTS / 100}`

/** Tickets included with a sponsorship package. */
export const EVENT_SPONSORSHIP_TICKET_COUNT = 4

export const PRODUCT_TIER_LABELS = {
  member: 'Member',
  inner_circle: 'Inner Circle',
  elite_circle: 'Elite Circle',
} as const

export type ProductTier = keyof typeof PRODUCT_TIER_LABELS

export const PAID_PRODUCT_TIERS: ProductTier[] = ['inner_circle', 'elite_circle']

export type EventAccessType = 'standard_event' | 'circle_social' | 'premium_event'

export const EVENT_ACCESS_LABELS: Record<EventAccessType, string> = {
  standard_event: 'Standard Event',
  circle_social: 'Circle Social',
  premium_event: 'Premium Event',
}

export type RegistrationMethod =
  | 'paid_per_event'
  | 'credit'
  | 'included_unlimited'

export type RegistrationUiState =
  | 'member_standard_free'
  | 'member_paid'
  | 'inner_circle_social_included'
  | 'inner_premium_credit_remaining'
  | 'inner_premium_credit_exhausted'
  | 'elite_circle_social_included'
  | 'elite_premium_credit_remaining'
  | 'elite_premium_credit_exhausted'
  | 'elite_priority_window'
  | 'priority_window_locked'

export type EventRegistrationDecision =
  | {
      allowed: false
      code:
        | 'not_approved'
        | 'payment_required'
        | 'subscription_inactive'
        | 'event_closed'
        | 'pending_approval'
        | 'priority_window'
      message: string
      upgradeTier?: 'inner_circle' | 'elite_circle'
      generalRsvpOpensAt?: string | null
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
      priorityAccess?: boolean
      uiState?: RegistrationUiState
      label: string
      description: string
    }

export function premiumCreditsForTier(
  tier: ProductTier
): number | null {
  if (tier === 'inner_circle') return INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD
  if (tier === 'elite_circle') return ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD
  return null
}

export function guestInvitesForTier(tier: ProductTier): number {
  if (tier === 'elite_circle') return ELITE_CIRCLE_GUEST_INVITES_PER_PERIOD
  return 0
}

/** Parse dollars like "25" or "25.00" into cents; empty → null. */
export function parseFeeDollarsToCents(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const dollars = Number.parseFloat(trimmed)
  if (!Number.isFinite(dollars) || dollars < 0) {
    throw new Error('Enter a valid non-negative fee amount.')
  }
  return Math.round(dollars * 100)
}

export function formatFeeCents(cents: number | null | undefined): string {
  if (cents == null) return ''
  return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)
}

/** Parse datetime-local value to ISO, or null if empty. */
export function parseDatetimeLocalToIso(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) {
    throw new Error('Enter a valid date and time.')
  }
  return date.toISOString()
}

/** Format ISO timestamp for datetime-local inputs. */
export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
