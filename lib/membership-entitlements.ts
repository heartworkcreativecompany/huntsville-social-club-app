import {
  EVENT_ACCESS_LABELS,
  FREE_REGISTRATION_RETURN_CUTOFF_DAYS,
  INNER_CIRCLE_FREE_REGISTRATIONS_PER_PERIOD,
  PRODUCT_TIER_LABELS,
  RETURN_FREE_REGISTRATION_BEFORE_CUTOFF,
  type EventAccessType,
  type EventRegistrationDecision,
  type ProductTier,
  type RegistrationMethod,
} from '@/lib/membership-tier-config'
import {
  eliteUnlimitedSummary,
  FEATURE_GATE_COPY,
  innerIncludedRemainingHeadline,
  innerIncludedSummary,
  memberFreeSummary,
} from '@/lib/membership-pricing-copy'
import {
  parseMembershipBilling,
  type MembershipBilling,
} from '@/lib/membership-systems'

export type EntitlementCycle = {
  id: string
  product_tier: 'inner_circle' | 'elite_circle'
  period_start: string
  period_end: string
  credits_granted: number | null
  credits_used: number
  is_active: boolean
}

export type MemberEntitlements = {
  productTier: ProductTier
  productTierLabel: string
  billing: MembershipBilling
  activeCycle: EntitlementCycle | null
  freeRegistrationsRemaining: number | null
  canMessage: boolean
  canAccessCircleSocial: boolean
  hasUnlimitedRegistrations: boolean
  subscriptionActive: boolean
}

export function normalizeBillingTier(
  tier: MembershipBilling['tier'] | string | null | undefined
): ProductTier | 'applicant' | 'vendor_reviewed' | 'community_partner' {
  if (tier === 'inner_circle') return 'inner_circle'
  if (tier === 'elite_circle' || tier === 'premium_member') return 'elite_circle'
  if (tier === 'member') return 'member'
  if (tier === 'vendor_reviewed') return 'vendor_reviewed'
  if (tier === 'community_partner') return 'community_partner'
  return 'applicant'
}

export function resolveProductTier(input: {
  role?: string | null
  billing?: MembershipBilling | unknown
  applicationApproved?: boolean
}): ProductTier {
  const role = input.role ?? 'member'
  const billing = parseMembershipBilling(input.billing)

  if (role === 'admin' || role === 'host') {
    return 'elite_circle'
  }

  const normalized = normalizeBillingTier(billing.tier)

  if (normalized === 'elite_circle' || normalized === 'community_partner') {
    return subscriptionIsActive(billing) ? 'elite_circle' : 'member'
  }

  if (normalized === 'inner_circle') {
    return subscriptionIsActive(billing) ? 'inner_circle' : 'member'
  }

  if (input.applicationApproved) {
    return 'member'
  }

  return 'member'
}

export function subscriptionIsActive(billing: MembershipBilling): boolean {
  return (
    billing.subscription_status === 'active' ||
    billing.subscription_status === 'grace'
  )
}

export function buildMemberEntitlements(input: {
  role?: string | null
  billing?: MembershipBilling | unknown
  applicationApproved?: boolean
  activeCycle?: EntitlementCycle | null
}): MemberEntitlements {
  const billing = parseMembershipBilling(input.billing)
  const productTier = resolveProductTier(input)
  const activeCycle = input.activeCycle ?? null

  let freeRegistrationsRemaining: number | null = null
  if (productTier === 'inner_circle' && activeCycle?.credits_granted != null) {
    freeRegistrationsRemaining = Math.max(
      0,
      activeCycle.credits_granted - activeCycle.credits_used
    )
  }

  return {
    productTier,
    productTierLabel: PRODUCT_TIER_LABELS[productTier],
    billing,
    activeCycle,
    freeRegistrationsRemaining,
    canMessage: productTier === 'inner_circle' || productTier === 'elite_circle',
    canAccessCircleSocial:
      productTier === 'inner_circle' || productTier === 'elite_circle',
    hasUnlimitedRegistrations: productTier === 'elite_circle',
    subscriptionActive: subscriptionIsActive(billing),
  }
}

export function canUseMessaging(entitlements: MemberEntitlements): boolean {
  return entitlements.canMessage
}

function paidPerEventDecision(
  description: string,
  uiState: 'member_paid' | 'inner_included_exhausted' = 'member_paid'
): EventRegistrationDecision {
  return {
    allowed: true,
    method: 'paid_per_event',
    paymentRequired: true,
    uiState,
    label:
      uiState === 'inner_included_exhausted'
        ? FEATURE_GATE_COPY.inner_included_exhausted.primaryCta
        : 'Paid registration required',
    description,
  }
}

export function evaluateEventRegistration(input: {
  entitlements: MemberEntitlements
  eventType: EventAccessType
  eventStatus: string | null
  isGoingRsvp: boolean
  registrationPreference?: 'included' | 'paid'
}): EventRegistrationDecision {
  const {
    entitlements,
    eventType,
    eventStatus,
    isGoingRsvp,
    registrationPreference,
  } = input
  const status = eventStatus ?? 'published'

  if (status === 'cancelled') {
    return {
      allowed: false,
      code: 'event_closed',
      message: 'This event has been cancelled.',
    }
  }

  if (status === 'draft') {
    return {
      allowed: false,
      code: 'event_closed',
      message: 'RSVP opens when this event is published.',
    }
  }

  if (!isGoingRsvp) {
    return {
      allowed: true,
      method: 'included_unlimited',
      label: 'Update RSVP',
      description: 'Changing maybe / not going does not consume free registrations.',
    }
  }

  if (eventType === 'circle_social' && !entitlements.canAccessCircleSocial) {
    return {
      allowed: false,
      code: 'circle_social_blocked',
      message: FEATURE_GATE_COPY.circle_social.inline,
      upgradeTier: 'inner_circle',
    }
  }

  if (entitlements.productTier === 'elite_circle') {
    return {
      allowed: true,
      method: 'included_unlimited',
      includedUnlimited: true,
      uiState: 'elite_unlimited',
      label: 'Included',
      description: eliteUnlimitedSummary(),
    }
  }

  if (entitlements.productTier === 'inner_circle') {
    if (eventType === 'circle_social') {
      return {
        allowed: true,
        method: 'included_unlimited',
        circleSocialIncluded: true,
        uiState: 'inner_circle_social_included',
        label: 'Included',
        description:
          'Circle Socials are included with Inner Circle at no additional cost.',
      }
    }

    const remaining = entitlements.freeRegistrationsRemaining ?? 0
    if (remaining <= 0 || registrationPreference === 'paid') {
      const description =
        remaining <= 0
          ? FEATURE_GATE_COPY.inner_included_exhausted.body
          : 'Pay in advance for this standard event instead of using an included registration.'
      return paidPerEventDecision(
        description,
        remaining <= 0 ? 'inner_included_exhausted' : 'member_paid'
      )
    }

    return {
      allowed: true,
      method: 'credit',
      freeRegistrationsRemaining: remaining,
      freeRegistrationsGranted: INNER_CIRCLE_FREE_REGISTRATIONS_PER_PERIOD,
      canPayInsteadOfIncluded: true,
      uiState: 'inner_included_remaining',
      label: FEATURE_GATE_COPY.inner_included_remaining.primaryCta,
      description: innerIncludedRemainingHeadline(remaining),
    }
  }

  if (entitlements.productTier === 'member') {
    return paidPerEventDecision(
      'Free members can attend eligible standard events by paying in advance.',
      'member_paid'
    )
  }

  return {
    allowed: false,
    code: 'not_approved',
    message: 'Membership approval is required to register for events.',
  }
}

export function registrationAccessLabel(
  decision: EventRegistrationDecision
): string {
  if (!decision.allowed) return decision.message
  return decision.label
}

export function daysUntilEvent(startsAt: string): number {
  const start = new Date(startsAt).getTime()
  const now = Date.now()
  return (start - now) / (1000 * 60 * 60 * 24)
}

export function shouldReturnFreeRegistrationOnCancellation(
  startsAt: string,
  hadFreeRegistrationConsumed: boolean
): boolean {
  if (!hadFreeRegistrationConsumed || !RETURN_FREE_REGISTRATION_BEFORE_CUTOFF) {
    return false
  }
  return daysUntilEvent(startsAt) > FREE_REGISTRATION_RETURN_CUTOFF_DAYS
}

/** @deprecated Use shouldReturnFreeRegistrationOnCancellation */
export function shouldReturnCreditOnCancellation(
  startsAt: string,
  hadCreditConsumed: boolean
): boolean {
  return shouldReturnFreeRegistrationOnCancellation(startsAt, hadCreditConsumed)
}

export function eventTypeLabel(eventType: EventAccessType | string | null): string {
  if (eventType === 'circle_social') return EVENT_ACCESS_LABELS.circle_social
  return EVENT_ACCESS_LABELS.standard_event
}

export function freeRegistrationsSummary(
  entitlements: MemberEntitlements
): string | null {
  if (entitlements.productTier === 'elite_circle') {
    return eliteUnlimitedSummary()
  }
  if (entitlements.productTier === 'inner_circle') {
    return innerIncludedSummary(entitlements.freeRegistrationsRemaining ?? 0)
  }
  if (entitlements.productTier === 'member') {
    return memberFreeSummary()
  }
  return null
}

/** @deprecated Use freeRegistrationsSummary */
export function creditsSummary(entitlements: MemberEntitlements): string | null {
  return freeRegistrationsSummary(entitlements)
}

export function messagingUpgradeMessage(tier: ProductTier): string {
  if (tier === 'member') {
    return FEATURE_GATE_COPY.messaging.inline
  }
  return 'Messaging is available on your plan.'
}

export type { RegistrationMethod }
