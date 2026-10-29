import {
  circleBenefitPackageFromPriceId,
  grantsForBenefitPackage,
  legacyBenefitPackageForTier,
  type CircleBenefitPackageId,
} from '@/lib/circle-benefit-packages'
import {
  EVENT_ACCESS_LABELS,
  FREE_REGISTRATION_RETURN_CUTOFF_DAYS,
  PRODUCT_TIER_LABELS,
  RETURN_FREE_REGISTRATION_BEFORE_CUTOFF,
  isCircleProductTier,
  isMessagingProductTier,
  type EventAccessType,
  type EventRegistrationDecision,
  type ProductTier,
  type RegistrationMethod,
} from '@/lib/membership-tier-config'
import {
  CONNECT_DISCOVERY_WITHOUT_MESSAGING_COPY,
  CONNECT_MEMBERSHIP_INCLUDED_COPY,
  ELITE_CIRCLE_SOCIALS_INCLUDED_COPY,
  FEATURE_GATE_COPY,
  UNMETERED_PREMIUM_EVENTS_COPY,
  PENDING_CIRCLE_ENTITLEMENT_COPY,
  UNAVAILABLE_CIRCLE_ENTITLEMENT_COPY,
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
import { scheduledCancellationHasEnded } from '@/lib/membership-billing-period'
import {
  currentlyEntitledBillingTier,
  parseMembershipBilling,
  type MembershipBilling,
} from '@/lib/membership-systems'
import { formatEventTimestampInChicago } from '@/lib/event-time'

/**
 * issued: a stored cycle supplies the balances.
 * pending: the Stripe price is inner_new or elite_new and no cycle exists yet.
 * known_package: a legacy price or complimentary/admin/host/partner package
 *   supplies the historical fallback.
 * unavailable: the member is on a Circle tier but the package cannot be identified.
 */
export type BenefitFulfillment =
  | 'issued'
  | 'pending'
  | 'known_package'
  | 'unavailable'

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
  /**
   * Current plan from billing or an active access override.
   * Ignores admin/host role elevation. Messaging and the membership card use this.
   */
  billingProductTier: ProductTier
  productTierLabel: string
  billing: MembershipBilling
  activeCycle: EntitlementCycle | null
  /**
   * Inner/Elite cycle used for curated-matching holdover after a downgrade to Connect.
   * Distinct from activeCycle so Connect cannot consume leftover credits.
   */
  matchingCycle: EntitlementCycle | null
  /** Premium event credits remaining this period (null = none / not applicable). */
  freeRegistrationsRemaining: number | null
  premiumCreditsRemaining: number | null
  /**
   * Circle Social credits remaining this period.
   * Null means unlimited for an issued cycle or a known legacy/complimentary package.
   * A pending or unavailable new-package state is 0, never null.
   */
  circleSocialCreditsRemaining: number | null
  guestInvitesRemaining: number
  benefitFulfillment: BenefitFulfillment
  canMessage: boolean
  /**
   * Inner Circle / Elite Circle curated matching (questionnaires, pools, inboxes).
   * Distinct from canMessage so Connect can DM without entering match pools.
   */
  canUseCuratedMatching: boolean
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
  if (tier === 'connect') return 'connect'
  if (tier === 'member') return 'member'
  if (tier === 'vendor_reviewed') return 'vendor_reviewed'
  if (tier === 'community_partner') return 'community_partner'
  return 'applicant'
}

/** Active Inner/Elite cycle whose period has not ended. */
export function isUnexpiredCircleEntitlementCycle(
  cycle: EntitlementCycle | null | undefined,
  now: Date = new Date()
): cycle is EntitlementCycle {
  if (!cycle || cycle.is_active === false) return false
  if (!isCircleProductTier(cycle.product_tier)) return false
  const periodEnd = Date.parse(cycle.period_end)
  if (Number.isNaN(periodEnd)) return false
  return periodEnd > now.getTime()
}

/**
 * Connect keep leftover Inner/Elite matching only while that cycle is unexpired.
 * When the leftover cycle is still marked active but `period_end` has passed,
 * pending curated recommendations must be expired.
 */
export function shouldExpireConnectHoldoverMatching(input: {
  productTier: ProductTier
  cycle?: EntitlementCycle | null
  now?: Date
}): boolean {
  if (input.productTier !== 'connect') return false
  const cycle = input.cycle
  if (!cycle || cycle.is_active === false) return false
  if (!isCircleProductTier(cycle.product_tier)) return false
  return !isUnexpiredCircleEntitlementCycle(cycle, input.now ?? new Date())
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

  if (
    normalizeBillingTier(billing.tier) === 'community_partner' &&
    subscriptionIsActive(billing, input.now)
  ) {
    return 'elite_circle'
  }

  // Confirmed current entitlement only. A saved Elite/Connect label, a previous
  // subscription, or an ended cancel-at-period-end does not qualify.
  return currentlyEntitledBillingTier(billing, input.now ?? new Date()) ?? 'member'
}

export function subscriptionIsActive(
  billing: MembershipBilling,
  now: Date = new Date()
): boolean {
  if (scheduledCancellationHasEnded(billing, now)) return false
  return (
    billing.subscription_status === 'active' ||
    billing.subscription_status === 'grace'
  )
}

function remainingPremiumCredits(
  activeCycle: EntitlementCycle | null
): number | null {
  if (!activeCycle) return 0
  if (activeCycle.credits_granted == null) return null
  return Math.max(0, activeCycle.credits_granted - activeCycle.credits_used)
}

function remainingCircleSocialCredits(
  productTier: ProductTier,
  activeCycle: EntitlementCycle | null
): number | null {
  if (!isCircleProductTier(productTier)) return null
  if (!activeCycle) return null
  const granted = activeCycle.circle_social_credits_granted
  if (granted == null) return null
  const used = activeCycle.circle_social_credits_used ?? 0
  return Math.max(0, granted - used)
}

function guestInvitesWithoutCycle(input: {
  role?: string | null
  billing: MembershipBilling
  accessOverride: SlimMembershipAccessOverride | null
  now?: Date
}): number {
  if (
    input.accessOverride &&
    isCircleProductTier(input.accessOverride.tier)
  ) {
    return grantsForBenefitPackage(
      legacyBenefitPackageForTier(input.accessOverride.tier)
    ).guestInvites
  }
  const role = input.role ?? 'member'
  if (role === 'admin' || role === 'host') {
    return grantsForBenefitPackage('elite_legacy').guestInvites
  }
  if (
    normalizeBillingTier(input.billing.tier) === 'community_partner' &&
    subscriptionIsActive(input.billing, input.now)
  ) {
    return grantsForBenefitPackage('elite_legacy').guestInvites
  }
  const fromPrice = circleBenefitPackageFromPriceId(input.billing.stripe_price_id)
  if (!fromPrice) return 0
  return grantsForBenefitPackage(fromPrice).guestInvites
}

function resolveBenefitFulfillment(input: {
  productTier: ProductTier
  billing: MembershipBilling
  activeCycle: EntitlementCycle | null
  role?: string | null
  accessOverride: SlimMembershipAccessOverride | null
  additionalPricePackages?: Readonly<Record<string, CircleBenefitPackageId>>
  now?: Date
}): BenefitFulfillment {
  if (input.activeCycle) return 'issued'
  if (!isCircleProductTier(input.productTier)) return 'issued'
  if (input.accessOverride && isCircleProductTier(input.accessOverride.tier)) {
    return 'known_package'
  }
  const role = input.role ?? 'member'
  if (role === 'admin' || role === 'host') return 'known_package'
  if (
    normalizeBillingTier(input.billing.tier) === 'community_partner' &&
    subscriptionIsActive(input.billing, input.now)
  ) {
    return 'known_package'
  }
  const pricePackage = circleBenefitPackageFromPriceId(
    input.billing.stripe_price_id,
    input.additionalPricePackages
  )
  if (pricePackage === 'inner_new' || pricePackage === 'elite_new') return 'pending'
  if (pricePackage === 'inner_legacy' || pricePackage === 'elite_legacy') {
    return 'known_package'
  }
  return 'unavailable'
}

export function buildMemberEntitlements(input: {
  role?: string | null
  billing?: MembershipBilling | unknown
  applicationApproved?: boolean
  activeCycle?: EntitlementCycle | null
  accessOverride?: SlimMembershipAccessOverride | null
  now?: Date
  /** Test-only price map. Production callers omit this. */
  additionalPricePackages?: Readonly<Record<string, CircleBenefitPackageId>>
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
  const billingProductTier = resolveProductTier({
    role: 'member',
    billing,
    applicationApproved: input.applicationApproved,
    accessOverride,
    now: input.now,
  })
  const now = input.now ?? new Date()
  const isCircle = isCircleProductTier(productTier)
  // Messaging requires an active paid subscription, or an active Inner/Elite
  // complimentary override. Grace, including a stored paid tier or price from
  // incomplete, paused, or a manual status, does not qualify. Other club
  // tools still use productTier, which can remain entitled during grace.
  const paidMessagingTier = accessOverride
    ? accessOverride.tier
    : billing.subscription_status === 'active'
      ? currentlyEntitledBillingTier(billing, now)
      : null
  const canMessage =
    paidMessagingTier != null && isMessagingProductTier(paidMessagingTier)
  const holdoverMatching =
    productTier === 'connect' &&
    isUnexpiredCircleEntitlementCycle(input.activeCycle, now)
  const matchingCycle = isUnexpiredCircleEntitlementCycle(input.activeCycle, now)
    ? input.activeCycle
    : null
  const canUseCuratedMatching = isCircle || holdoverMatching

  // Credits only follow the current Circle product. Connect keep leftover
  // Inner/Elite cycles for matching holdover, but must not consume credits.
  const activeCycle =
    isCircle && input.activeCycle?.is_active !== false
      ? (input.activeCycle ?? null)
      : null

  const benefitFulfillment = resolveBenefitFulfillment({
    productTier,
    billing,
    activeCycle,
    role: input.role,
    accessOverride,
    additionalPricePackages: input.additionalPricePackages,
    now,
  })
  const unissued =
    benefitFulfillment === 'pending' || benefitFulfillment === 'unavailable'
  const premiumCreditsRemaining = !isCircle
    ? null
    : unissued
      ? 0
      : remainingPremiumCredits(activeCycle)
  const circleSocialCreditsRemaining = !isCircle
    ? null
    : unissued
      ? 0
      : remainingCircleSocialCredits(productTier, activeCycle)
  const guestGranted = !isCircle || unissued
    ? 0
    : activeCycle
      ? (activeCycle.guest_invites_granted ?? 0)
      : guestInvitesWithoutCycle({
          role: input.role,
          billing,
          accessOverride,
          now,
        })
  const guestUsed = isCircle && !unissued ? (activeCycle?.guest_invites_used ?? 0) : 0

  return {
    productTier,
    billingProductTier,
    productTierLabel: PRODUCT_TIER_LABELS[productTier],
    billing,
    activeCycle,
    matchingCycle,
    freeRegistrationsRemaining: premiumCreditsRemaining,
    premiumCreditsRemaining,
    circleSocialCreditsRemaining,
    guestInvitesRemaining: Math.max(0, guestGranted - guestUsed),
    canMessage,
    canUseCuratedMatching,
    canAccessCircleSocial: isCircle,
    hasUnlimitedRegistrations: false,
    canCreateStandardEvents: isCircle,
    canApplyBusinessListing: productTier === 'elite_circle',
    canBrowseBusinessDirectory: true,
    hasPriorityRsvp: productTier === 'elite_circle',
    subscriptionActive: subscriptionIsActive(billing),
    accessOverride,
    benefitFulfillment,
  }
}

export function canUseMessaging(entitlements: MemberEntitlements): boolean {
  return entitlements.canMessage
}

export function canUseCuratedMatching(entitlements: MemberEntitlements): boolean {
  return entitlements.canUseCuratedMatching
}

/** Connect (messaging without Circle matching) should not see match/questionnaire UI. */
export function shouldHideCuratedMatchingSurfaces(
  entitlements: MemberEntitlements | null | undefined
): boolean {
  return Boolean(entitlements?.canMessage && !entitlements.canUseCuratedMatching)
}

/**
 * Paid-plan helper retained for Circle and Connect product checks.
 * Intentional messaging does not use this function.
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

/** Safe copy when a new request is blocked without naming which member failed. */
export const MUTUAL_MESSAGING_REQUIRED_MESSAGE =
  'Messaging is available when both members have verified identity.' as const

function unissuedEntitlementDecision(
  entitlements: MemberEntitlements
): EventRegistrationDecision | null {
  if (entitlements.benefitFulfillment === 'pending') {
    return paidPerEventDecision(PENDING_CIRCLE_ENTITLEMENT_COPY)
  }
  if (entitlements.benefitFulfillment === 'unavailable') {
    return paidPerEventDecision(UNAVAILABLE_CIRCLE_ENTITLEMENT_COPY)
  }
  return null
}

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
      message: `Priority RSVP opens for Elite Circle at ${formatEventTimestampInChicago(priorityAt.toISOString())}. General RSVP opens ${formatEventTimestampInChicago(generalAt.toISOString())}.`,
      generalRsvpOpensAt: general,
      upgradeTier: 'elite_circle',
    }
  }

  return {
    allowed: false,
    code: 'priority_window',
    message: `Priority RSVP is open for Elite Circle until ${formatEventTimestampInChicago(generalAt.toISOString())}. General RSVP opens then.`,
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

  // Circle Socials are metered when the stored cycle has a numeric grant.
  // Null remains unlimited: legacy Elite, and Inner cycles open before metering.
  if (eventType === 'circle_social') {
    if (!entitlements.canAccessCircleSocial) {
      return paidPerEventDecision(
        'Free members can attend Circle Socials by paying the event fee, or upgrade for included access.',
        'member_paid'
      )
    }

    const unissued = unissuedEntitlementDecision(entitlements)
    if (unissued) return unissued

    const remaining = entitlements.circleSocialCreditsRemaining
    const granted = entitlements.activeCycle?.circle_social_credits_granted

    if (remaining == null) {
      const elite = entitlements.productTier === 'elite_circle'
      return {
        allowed: true,
        method: 'included_unlimited',
        circleSocialIncluded: true,
        priorityAccess: entitlements.hasPriorityRsvp,
        uiState: elite
          ? 'elite_circle_social_included'
          : 'inner_circle_social_included',
        label: 'Included',
        description: elite
          ? ELITE_CIRCLE_SOCIALS_INCLUDED_COPY
          : 'Included with Inner Circle this billing period.',
      }
    }

    if (remaining > 0) {
      return {
        allowed: true,
        method: 'credit',
        creditKind: 'circle_social',
        freeRegistrationsRemaining: remaining,
        freeRegistrationsGranted: granted ?? remaining,
        circleSocialIncluded: true,
        priorityAccess: entitlements.hasPriorityRsvp,
        uiState:
          entitlements.productTier === 'elite_circle'
            ? 'elite_circle_social_included'
            : 'inner_circle_social_credit_remaining',
        label: 'Included',
        description: innerCircleSocialRemainingHeadline(remaining, granted ?? undefined),
      }
    }

    if (
      entitlements.productTier === 'inner_circle' &&
      (granted ?? 0) > 0
    ) {
      return {
        allowed: false,
        code: 'included_credits_exhausted',
        message: INNER_CIRCLE_SOCIAL_CREDITS_EXHAUSTED_MESSAGE,
        upgradeTier: 'elite_circle',
      }
    }

    return paidPerEventDecision(
      granted === 0
        ? 'Circle Socials are paid per event on this membership.'
        : 'You have used the Circle Social credits included in this billing period. You can still attend by paying the event fee.'
    )
  }

  if (eventType === 'premium_event') {
    const unissued = unissuedEntitlementDecision(entitlements)
    if (unissued) return unissued

    const remaining = entitlements.premiumCreditsRemaining
    const granted = entitlements.activeCycle?.credits_granted
    const isCircle =
      entitlements.productTier === 'inner_circle' ||
      entitlements.productTier === 'elite_circle'

    if (isCircle && remaining == null && granted == null && entitlements.activeCycle) {
      return {
        allowed: true,
        method: 'included_unlimited',
        includedUnlimited: true,
        priorityAccess: entitlements.hasPriorityRsvp,
        uiState:
          entitlements.productTier === 'elite_circle'
            ? 'elite_premium_credit_remaining'
            : 'inner_premium_credit_remaining',
        label: 'Included',
        description: 'Included premium events are not metered for this billing period.',
      }
    }

    const remainingCount = remaining ?? 0
    if (isCircle && remainingCount > 0 && registrationPreference !== 'paid') {
      const grantedCount = granted ?? remainingCount
      return {
        allowed: true,
        method: 'credit',
        freeRegistrationsRemaining: remainingCount,
        freeRegistrationsGranted: grantedCount,
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
            ? elitePremiumRemainingHeadline(remainingCount, grantedCount)
            : innerIncludedRemainingHeadline(remainingCount, grantedCount),
      }
    }

    if (isCircle) {
      return paidPerEventDecision(
        granted === 0
          ? 'Premium events are paid per event on this membership.'
          : remainingCount <= 0
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
  if (entitlements.benefitFulfillment === 'pending') {
    return [PENDING_CIRCLE_ENTITLEMENT_COPY]
  }
  if (entitlements.benefitFulfillment === 'unavailable') {
    return [UNAVAILABLE_CIRCLE_ENTITLEMENT_COPY]
  }
  if (entitlements.productTier === 'elite_circle') {
    const cycle = entitlements.activeCycle
    const storedPremium = cycle ? cycle.credits_granted : undefined
    const lines = [
      cycle && storedPremium == null
        ? UNMETERED_PREMIUM_EVENTS_COPY
        : elitePremiumRemainingHeadline(
            entitlements.premiumCreditsRemaining ?? 0,
            storedPremium ?? entitlements.premiumCreditsRemaining ?? 0
          ),
    ]
    if (entitlements.circleSocialCreditsRemaining == null) {
      lines.push(ELITE_CIRCLE_SOCIALS_INCLUDED_COPY)
    } else if ((entitlements.activeCycle?.circle_social_credits_granted ?? 0) === 0) {
      lines.push('Circle Socials are paid per event on this membership.')
    } else {
      lines.push(
        innerCircleSocialRemainingHeadline(
          entitlements.circleSocialCreditsRemaining,
          entitlements.activeCycle?.circle_social_credits_granted ?? undefined
        )
      )
    }
    return lines
  }
  if (entitlements.productTier === 'inner_circle') {
    const cycle = entitlements.activeCycle
    const premiumGranted = cycle?.credits_granted
    const lines = [
      cycle && premiumGranted == null
        ? UNMETERED_PREMIUM_EVENTS_COPY
        : premiumGranted === 0
          ? 'Premium events are paid per event on this membership.'
          : innerIncludedSummary(
              entitlements.premiumCreditsRemaining ?? 0,
              premiumGranted ?? undefined
            ),
    ]
    if (entitlements.circleSocialCreditsRemaining != null) {
      const socialGranted = entitlements.activeCycle?.circle_social_credits_granted
      lines.push(
        socialGranted === 0
          ? 'Circle Socials are paid per event on this membership.'
          : innerCircleSocialRemainingHeadline(
              entitlements.circleSocialCreditsRemaining,
              socialGranted ?? undefined
            )
      )
    }
    return lines
  }
  if (entitlements.productTier === 'member') {
    return [memberFreeSummary()]
  }
  if (entitlements.productTier === 'connect') {
    return [
      entitlements.canMessage
        ? CONNECT_MEMBERSHIP_INCLUDED_COPY
        : CONNECT_DISCOVERY_WITHOUT_MESSAGING_COPY,
    ]
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

export function messagingUpgradeMessage(_tier: ProductTier): string {
  return FEATURE_GATE_COPY.messaging.inline
}

export type { RegistrationMethod }
