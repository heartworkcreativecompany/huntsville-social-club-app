import {
  EVENT_ACCESS_LABELS,
  FREE_REGISTRATION_RETURN_CUTOFF_DAYS,
  INNER_CIRCLE_CIRCLE_SOCIAL_CREDITS_PER_PERIOD,
  INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD,
  ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD,
  PRODUCT_TIER_LABELS,
  RETURN_FREE_REGISTRATION_BEFORE_CUTOFF,
  circleSocialCreditsForTier,
  guestInvitesForTier,
  premiumCreditsForTier,
  type EventAccessType,
  type EventRegistrationDecision,
  type ProductTier,
  type RegistrationMethod,
} from '@/lib/membership-tier-config'
import {
  ELITE_CIRCLE_SOCIALS_INCLUDED_COPY,
  FEATURE_GATE_COPY,
  INNER_CIRCLE_SOCIAL_CREDITS_EXHAUSTED_MESSAGE,
  elitePremiumRemainingHeadline,
  innerCircleSocialRemainingHeadline,
  innerIncludedRemainingHeadline,
  innerIncludedSummary,
  memberFreeSummary,
} from '@/lib/membership-pricing-copy'
import {
  isActiveMembershipAccessOverride,
  type SlimMembershipAccessOverride,
} from '@/lib/membership-access-override'
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
  guest_invites_granted?: number
  guest_invites_used?: number
  /**
   * Inner Circle Circle Social allotment for this cycle.
   * Null = unlimited (Elite, or Inner Circle current period at rollout).
   */
  circle_social_credits_granted?: number | null
  circle_social_credits_used?: number
  is_active: boolean
}

export type MemberEntitlements = {
  productTier: ProductTier
  productTierLabel: string
  billing: MembershipBilling
  activeCycle: EntitlementCycle | null
  /** Premium event credits remaining this period (null = none / not applicable). */
  freeRegistrationsRemaining: number | null
  premiumCreditsRemaining: number | null
  /**
   * Inner Circle Circle Social credits remaining this period.
   * Null = unlimited / not metered (Elite, grandfathered Inner Circle cycle, or no cycle).
   */
  circleSocialCreditsRemaining: number | null
  guestInvitesRemaining: number
  canMessage: boolean
  canAccessCircleSocial: boolean
  /** @deprecated Elite no longer has unlimited registrations; use premium credits. */
  hasUnlimitedRegistrations: boolean
  canCreateStandardEvents: boolean
  canApplyBusinessListing: boolean
  canBrowseBusinessDirectory: boolean
  hasPriorityRsvp: boolean
  subscriptionActive: boolean
  /** Slim override used for entitlements only. Never includes reason or admin actors. */
  accessOverride: SlimMembershipAccessOverride | null
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
  accessOverride?: SlimMembershipAccessOverride | null
  now?: Date
}): ProductTier {
  const role = input.role ?? 'member'
  const billing = parseMembershipBilling(input.billing)

  if (role === 'admin' || role === 'host') {
    return 'elite_circle'
  }

  if (isActiveMembershipAccessOverride(input.accessOverride, input.now)) {
    return input.accessOverride.tier
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

function remainingPremiumCredits(
  productTier: ProductTier,
  activeCycle: EntitlementCycle | null
): number | null {
  const granted = premiumCreditsForTier(productTier)
  if (granted == null) return null
  if (!activeCycle) return 0
  const cycleGranted = activeCycle.credits_granted ?? granted
  return Math.max(0, cycleGranted - activeCycle.credits_used)
}

function remainingCircleSocialCredits(
  productTier: ProductTier,
  activeCycle: EntitlementCycle | null
): number | null {
  if (productTier !== 'inner_circle') return null
  const configured = circleSocialCreditsForTier(productTier)
  if (configured == null) return null
  if (!activeCycle) return null
  const granted = activeCycle.circle_social_credits_granted
  if (granted == null) return null
  const used = activeCycle.circle_social_credits_used ?? 0
  return Math.max(0, granted - used)
}

export function buildMemberEntitlements(input: {
  role?: string | null
  billing?: MembershipBilling | unknown
  applicationApproved?: boolean
  activeCycle?: EntitlementCycle | null
  accessOverride?: SlimMembershipAccessOverride | null
  now?: Date
}): MemberEntitlements {
  const billing = parseMembershipBilling(input.billing)
  const accessOverride = isActiveMembershipAccessOverride(
    input.accessOverride,
    input.now
  )
    ? {
        tier: input.accessOverride.tier,
        startsAt: input.accessOverride.startsAt,
        expiresAt: input.accessOverride.expiresAt,
        revokedAt: input.accessOverride.revokedAt ?? null,
      }
    : null
  const productTier = resolveProductTier({ ...input, accessOverride })
  const isPaid =
    productTier === 'inner_circle' || productTier === 'elite_circle'

  // Free / expired members must not inherit leftover paid cycle credit rows.
  const activeCycle =
    isPaid && input.activeCycle?.is_active !== false
      ? (input.activeCycle ?? null)
      : null

  const premiumCreditsRemaining = isPaid
    ? remainingPremiumCredits(productTier, activeCycle)
    : null
  const circleSocialCreditsRemaining = isPaid
    ? remainingCircleSocialCredits(productTier, activeCycle)
    : null
  const guestGranted = isPaid
    ? (activeCycle?.guest_invites_granted ?? guestInvitesForTier(productTier))
    : 0
  const guestUsed = isPaid ? (activeCycle?.guest_invites_used ?? 0) : 0

  return {
    productTier,
    productTierLabel: PRODUCT_TIER_LABELS[productTier],
    billing,
    activeCycle,
    freeRegistrationsRemaining: premiumCreditsRemaining,
    premiumCreditsRemaining,
    circleSocialCreditsRemaining,
    guestInvitesRemaining: Math.max(0, guestGranted - guestUsed),
    canMessage: isPaid,
    canAccessCircleSocial: isPaid,
    hasUnlimitedRegistrations: false,
    canCreateStandardEvents: isPaid,
    canApplyBusinessListing: productTier === 'elite_circle',
    canBrowseBusinessDirectory: true,
    hasPriorityRsvp: productTier === 'elite_circle',
    subscriptionActive: subscriptionIsActive(billing),
    accessOverride,
  }
}

export function canUseMessaging(entitlements: MemberEntitlements): boolean {
  return entitlements.canMessage
}

/**
 * New message requests require both parties to have active paid messaging.
 * Does not encode which party failed — callers must use a generic error/UI.
 */
export function canStartMessageRequest(input: {
  senderEntitlements: Pick<MemberEntitlements, 'canMessage'>
  recipientEntitlements: Pick<MemberEntitlements, 'canMessage'>
  senderId: string
  recipientId: string
}): boolean {
  if (!input.senderId || !input.recipientId) return false
  if (input.senderId === input.recipientId) return false
  return (
    canUseMessaging(input.senderEntitlements as MemberEntitlements) &&
    canUseMessaging(input.recipientEntitlements as MemberEntitlements)
  )
}

/** Safe copy for UI + server when a new request is blocked by mutual eligibility. */
export const MUTUAL_MESSAGING_REQUIRED_MESSAGE =
  'Messaging is available when both members have an active paid membership.' as const

function paidPerEventDecision(
  description: string,
  uiState: 'member_paid' | 'inner_premium_credit_exhausted' | 'elite_premium_credit_exhausted' = 'member_paid'
): EventRegistrationDecision {
  return {
    allowed: true,
    method: 'paid_per_event',
    paymentRequired: true,
    uiState,
    label:
      uiState === 'member_paid'
        ? 'Paid registration required'
        : FEATURE_GATE_COPY.inner_included_exhausted.primaryCta,
    description,
  }
}

function isPriorityEvent(eventType: EventAccessType): boolean {
  return eventType === 'circle_social' || eventType === 'premium_event'
}

/**
 * Elite priority RSVP: when general_rsvp_opens_at is set and now is before it,
 * only Elite (hasPriorityRsvp) may register as going.
 */
export function evaluatePriorityRsvpWindow(input: {
  entitlements: MemberEntitlements
  eventType: EventAccessType
  priorityRsvpOpensAt?: string | null
  generalRsvpOpensAt?: string | null
  now?: Date
}): EventRegistrationDecision | null {
  if (!isPriorityEvent(input.eventType)) return null

  const general = input.generalRsvpOpensAt
  if (!general) return null

  const now = input.now ?? new Date()
  const generalAt = new Date(general)
  if (Number.isNaN(generalAt.getTime()) || now >= generalAt) return null

  const priorityAt = input.priorityRsvpOpensAt
    ? new Date(input.priorityRsvpOpensAt)
    : null
  const priorityOpen =
    !priorityAt ||
    Number.isNaN(priorityAt.getTime()) ||
    now >= priorityAt

  if (input.entitlements.hasPriorityRsvp && priorityOpen) {
    return null
  }

  if (!priorityOpen && priorityAt) {
    return {
      allowed: false,
      code: 'priority_window',
      message: `Priority RSVP opens for Elite Circle at ${priorityAt.toLocaleString()}. General RSVP opens ${generalAt.toLocaleString()}.`,
      generalRsvpOpensAt: general,
      upgradeTier: 'elite_circle',
    }
  }

  return {
    allowed: false,
    code: 'priority_window',
    message: `Priority RSVP is open for Elite Circle until ${generalAt.toLocaleString()}. General RSVP opens then.`,
    generalRsvpOpensAt: general,
    upgradeTier: 'elite_circle',
  }
}

export function evaluateEventRegistration(input: {
  entitlements: MemberEntitlements
  eventType: EventAccessType
  eventStatus: string | null
  isGoingRsvp: boolean
  registrationPreference?: 'included' | 'paid'
  priorityRsvpOpensAt?: string | null
  generalRsvpOpensAt?: string | null
  now?: Date
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

  if (status === 'draft' || status === 'pending_approval') {
    return {
      allowed: false,
      code: status === 'pending_approval' ? 'pending_approval' : 'event_closed',
      message:
        status === 'pending_approval'
          ? 'This event is awaiting admin approval before RSVPs open.'
          : 'RSVP opens when this event is published.',
    }
  }

  if (!isGoingRsvp) {
    return {
      allowed: true,
      method: 'included_unlimited',
      label: 'Update RSVP',
      description: 'Changing maybe / not going does not consume premium credits.',
    }
  }

  const priorityBlock = evaluatePriorityRsvpWindow({
    entitlements,
    eventType,
    priorityRsvpOpensAt: input.priorityRsvpOpensAt,
    generalRsvpOpensAt: input.generalRsvpOpensAt,
    now: input.now,
  })
  if (priorityBlock) return priorityBlock

  // Standard events are free for all approved members.
  if (eventType === 'standard_event') {
    return {
      allowed: true,
      method: 'included_unlimited',
      includedUnlimited: true,
      uiState: 'member_standard_free',
      label: 'Free for members',
      description: 'Standard events are free for all approved members.',
    }
  }

  // Circle Socials: Inner Circle uses period credits; Elite is included/unlimited.
  if (eventType === 'circle_social') {
    if (!entitlements.canAccessCircleSocial) {
      return paidPerEventDecision(
        'Free members can attend Circle Socials by paying the event fee, or upgrade for included access.',
        'member_paid'
      )
    }

    if (entitlements.productTier === 'elite_circle') {
      return {
        allowed: true,
        method: 'included_unlimited',
        circleSocialIncluded: true,
        priorityAccess: entitlements.hasPriorityRsvp,
        uiState: 'elite_circle_social_included',
        label: 'Included',
        description: ELITE_CIRCLE_SOCIALS_INCLUDED_COPY,
      }
    }

    const remaining = entitlements.circleSocialCreditsRemaining
    const granted = INNER_CIRCLE_CIRCLE_SOCIAL_CREDITS_PER_PERIOD

    // Null remaining = not metered this cycle (rollout grandfather / no cycle).
    if (remaining == null) {
      return {
        allowed: true,
        method: 'included_unlimited',
        circleSocialIncluded: true,
        priorityAccess: entitlements.hasPriorityRsvp,
        uiState: 'inner_circle_social_included',
        label: 'Included',
        description: 'Included with Inner Circle this billing period.',
      }
    }

    if (remaining > 0) {
      return {
        allowed: true,
        method: 'credit',
        creditKind: 'circle_social',
        freeRegistrationsRemaining: remaining,
        freeRegistrationsGranted: granted,
        circleSocialIncluded: true,
        priorityAccess: entitlements.hasPriorityRsvp,
        uiState: 'inner_circle_social_credit_remaining',
        label: 'Included',
        description: innerCircleSocialRemainingHeadline(remaining),
      }
    }

    return {
      allowed: false,
      code: 'included_credits_exhausted',
      message: INNER_CIRCLE_SOCIAL_CREDITS_EXHAUSTED_MESSAGE,
      upgradeTier: 'elite_circle',
    }
  }

  // Premium events: credits or pay.
  if (eventType === 'premium_event') {
    const remaining = entitlements.premiumCreditsRemaining ?? 0
    const granted =
      entitlements.productTier === 'elite_circle'
        ? ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD
        : INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD

    if (
      (entitlements.productTier === 'inner_circle' ||
        entitlements.productTier === 'elite_circle') &&
      remaining > 0 &&
      registrationPreference !== 'paid'
    ) {
      return {
        allowed: true,
        method: 'credit',
        freeRegistrationsRemaining: remaining,
        freeRegistrationsGranted: granted,
        canPayInsteadOfIncluded: true,
        creditKind: 'premium_event',
        priorityAccess: entitlements.hasPriorityRsvp,
        uiState:
          entitlements.productTier === 'elite_circle'
            ? 'elite_premium_credit_remaining'
            : 'inner_premium_credit_remaining',
        label: FEATURE_GATE_COPY.inner_included_remaining.primaryCta,
        description:
          entitlements.productTier === 'elite_circle'
            ? elitePremiumRemainingHeadline(remaining, granted)
            : innerIncludedRemainingHeadline(remaining),
      }
    }

    if (entitlements.productTier === 'inner_circle' || entitlements.productTier === 'elite_circle') {
      return paidPerEventDecision(
        remaining <= 0
          ? FEATURE_GATE_COPY.inner_included_exhausted.inline
          : 'Pay for this premium event instead of using an included credit.',
        entitlements.productTier === 'elite_circle'
          ? 'elite_premium_credit_exhausted'
          : 'inner_premium_credit_exhausted'
      )
    }

    return paidPerEventDecision(
      'Premium events are available to free members by paying the event fee.',
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
  if (eventType === 'premium_event') return EVENT_ACCESS_LABELS.premium_event
  return EVENT_ACCESS_LABELS.standard_event
}

export function membershipPerkCopyLines(
  entitlements: MemberEntitlements
): string[] {
  if (entitlements.productTier === 'elite_circle') {
    return [
      elitePremiumRemainingHeadline(
        entitlements.premiumCreditsRemaining ?? 0,
        entitlements.activeCycle?.credits_granted ??
          ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD
      ),
      ELITE_CIRCLE_SOCIALS_INCLUDED_COPY,
    ]
  }
  if (entitlements.productTier === 'inner_circle') {
    const lines = [
      innerIncludedSummary(entitlements.premiumCreditsRemaining ?? 0),
    ]
    if (entitlements.circleSocialCreditsRemaining != null) {
      lines.push(
        innerCircleSocialRemainingHeadline(
          entitlements.circleSocialCreditsRemaining
        )
      )
    }
    return lines
  }
  if (entitlements.productTier === 'member') {
    return [memberFreeSummary()]
  }
  return []
}

export function freeRegistrationsSummary(
  entitlements: MemberEntitlements
): string | null {
  const lines = membershipPerkCopyLines(entitlements)
  return lines.length > 0 ? lines.join(' ') : null
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
