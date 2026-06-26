/**
 * Structured membership systems: verification badges, approval gates,
 * locality confirmation, premium verification, and billing foundations.
 */

import type { ApplicationDraft } from '@/lib/application'
import {
  applicationStatusLabel,
  resolveApplicationStatus,
  type ApplicationStatus,
} from '@/lib/application'

// ---------------------------------------------------------------------------
// Shared gate / review status
// ---------------------------------------------------------------------------

export type ReviewStatus =
  | 'incomplete'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'needs_followup'

export const REVIEW_STATUSES: ReviewStatus[] = [
  'incomplete',
  'pending_review',
  'approved',
  'rejected',
  'needs_followup',
]

export function reviewStatusLabel(status: ReviewStatus): string {
  switch (status) {
    case 'incomplete':
      return 'Incomplete'
    case 'pending_review':
      return 'Pending review'
    case 'approved':
      return 'Approved'
    case 'rejected':
      return 'Rejected'
    case 'needs_followup':
      return 'Needs follow-up'
  }
}

// ---------------------------------------------------------------------------
// A. Verification badges (public-safe when approved)
// ---------------------------------------------------------------------------

export type VerificationBadgeKey =
  | 'email'
  | 'phone'
  | 'locality'
  | 'profile_reviewed'
  | 'photo_reviewed'
  | 'id_verified'
  | 'liveness'
  | 'background_check'

export type VerificationBadgeDef = {
  key: VerificationBadgeKey
  label: string
  /** Shown on directory cards (max priority badges) */
  cardPriority: number
  /** Visible to other members when status is approved */
  publicSafe: boolean
  /** Only shown on own profile or admin views */
  adminOnly?: boolean
}

export const VERIFICATION_BADGE_DEFS: VerificationBadgeDef[] = [
  { key: 'email', label: 'Email verified', cardPriority: 1, publicSafe: true },
  { key: 'phone', label: 'Phone verified', cardPriority: 2, publicSafe: true },
  {
    key: 'locality',
    label: 'Locality confirmed',
    cardPriority: 3,
    publicSafe: true,
  },
  {
    key: 'profile_reviewed',
    label: 'Profile reviewed',
    cardPriority: 4,
    publicSafe: true,
  },
  {
    key: 'photo_reviewed',
    label: 'Photo reviewed',
    cardPriority: 5,
    publicSafe: true,
  },
  {
    key: 'id_verified',
    label: 'ID verified',
    cardPriority: 10,
    publicSafe: false,
    adminOnly: true,
  },
  {
    key: 'liveness',
    label: 'Liveness verified',
    cardPriority: 11,
    publicSafe: false,
    adminOnly: true,
  },
  {
    key: 'background_check',
    label: 'Background checked',
    cardPriority: 12,
    publicSafe: false,
    adminOnly: true,
  },
]

export type VerificationState = Partial<
  Record<VerificationBadgeKey, ReviewStatus>
>

export function parseVerificationState(value: unknown): VerificationState {
  if (!value || typeof value !== 'object') return {}
  const raw = value as Record<string, unknown>
  const result: VerificationState = {}
  for (const def of VERIFICATION_BADGE_DEFS) {
    const s = raw[def.key]
    if (
      s === 'incomplete' ||
      s === 'pending_review' ||
      s === 'approved' ||
      s === 'rejected' ||
      s === 'needs_followup'
    ) {
      result[def.key] = s
    }
  }
  return result
}

export type DisplayBadge = {
  key: string
  label: string
  variant: 'success' | 'accent' | 'premium' | 'warning' | 'muted'
}

function badgeVariantForStatus(
  status: ReviewStatus
): DisplayBadge['variant'] {
  if (status === 'approved') return 'success'
  if (status === 'pending_review' || status === 'needs_followup') return 'warning'
  if (status === 'rejected') return 'muted'
  return 'muted'
}

/** Public verification badges for member-facing UI. */
export function publicVerificationBadges(
  state: VerificationState,
  options?: { maxCount?: number; includePending?: boolean }
): DisplayBadge[] {
  const max = options?.maxCount ?? 99
  const badges: DisplayBadge[] = []

  const sorted = [...VERIFICATION_BADGE_DEFS]
    .filter((d) => d.publicSafe)
    .sort((a, b) => a.cardPriority - b.cardPriority)

  for (const def of sorted) {
    const status = state[def.key]
    if (!status) continue
    if (status === 'approved' || (options?.includePending && status !== 'incomplete')) {
      badges.push({
        key: def.key,
        label: def.label,
        variant: badgeVariantForStatus(status),
      })
    }
    if (badges.length >= max) break
  }

  return badges
}

/** Card-level badges — top 2 public verification badges. */
export function cardVerificationBadges(state: VerificationState): DisplayBadge[] {
  return publicVerificationBadges(state, { maxCount: 2 })
}

/** Admin sees all verification statuses. */
export function adminVerificationBadges(state: VerificationState): DisplayBadge[] {
  return VERIFICATION_BADGE_DEFS.map((def) => {
    const status = state[def.key] ?? 'incomplete'
    return {
      key: def.key,
      label: `${def.label}: ${reviewStatusLabel(status)}`,
      variant: badgeVariantForStatus(status),
    }
  })
}

// ---------------------------------------------------------------------------
// B. Membership tier badges
// ---------------------------------------------------------------------------

export type MembershipTierKey =
  | 'applicant'
  | 'pending_review'
  | 'member'
  | 'inner_circle'
  | 'elite_circle'
  | 'premium_member'
  | 'vendor_reviewed'
  | 'community_partner'

export type MembershipTierDef = {
  key: MembershipTierKey
  label: string
  variant: DisplayBadge['variant']
  cardPriority: number
}

export const MEMBERSHIP_TIER_DEFS: MembershipTierDef[] = [
  { key: 'applicant', label: 'Applicant', variant: 'muted', cardPriority: 1 },
  {
    key: 'pending_review',
    label: 'Pending review',
    variant: 'warning',
    cardPriority: 2,
  },
  { key: 'member', label: 'Member', variant: 'success', cardPriority: 3 },
  {
    key: 'inner_circle',
    label: 'Inner Circle',
    variant: 'premium',
    cardPriority: 4,
  },
  {
    key: 'elite_circle',
    label: 'Elite Circle',
    variant: 'premium',
    cardPriority: 5,
  },
  {
    key: 'premium_member',
    label: 'Premium member',
    variant: 'premium',
    cardPriority: 6,
  },
  {
    key: 'vendor_reviewed',
    label: 'Vendor reviewed',
    variant: 'premium',
    cardPriority: 7,
  },
  {
    key: 'community_partner',
    label: 'Community partner',
    variant: 'premium',
    cardPriority: 8,
  },
]

export function resolveMembershipTier(input: {
  application_status?: string | null
  role?: string | null
  billing?: MembershipBilling
  premium?: PremiumVerification
}): MembershipTierKey {
  const status = resolveApplicationStatus(input)
  const role = input.role ?? 'member'
  const billing = input.billing ?? emptyMembershipBilling()
  const premium = input.premium ?? emptyPremiumVerification()

  if (role === 'admin' || role === 'host') {
    return status === 'approved' ? 'community_partner' : 'pending_review'
  }

  if (billing.tier === 'community_partner') return 'community_partner'
  if (billing.tier === 'vendor_reviewed' || premium.public_badge === 'vendor_reviewed') {
    return 'vendor_reviewed'
  }
  if (billing.tier === 'elite_circle') return 'elite_circle'
  if (billing.tier === 'premium_member') return 'elite_circle'
  if (billing.tier === 'inner_circle') return 'inner_circle'

  if (status === 'approved') return 'member'
  if (status === 'submitted' || status === 'in_review' || status === 'needs_info') {
    return 'pending_review'
  }
  return 'applicant'
}

export function membershipTierBadge(
  tier: MembershipTierKey
): DisplayBadge {
  const def =
    MEMBERSHIP_TIER_DEFS.find((d) => d.key === tier) ??
    MEMBERSHIP_TIER_DEFS[0]
  return { key: def.key, label: def.label, variant: def.variant }
}

export function cardTierBadges(tier: MembershipTierKey): DisplayBadge[] {
  const badge = membershipTierBadge(tier)
  if (tier === 'member' || tier === 'inner_circle' || tier === 'elite_circle' || tier === 'premium_member' || tier === 'vendor_reviewed' || tier === 'community_partner') {
    return [badge]
  }
  return [badge]
}

// ---------------------------------------------------------------------------
// C. Approval gates (required for standard approval)
// ---------------------------------------------------------------------------

export type ApprovalGateKey =
  | 'email_verified'
  | 'phone_verified'
  | 'photos_reviewed'
  | 'application_reviewed'
  | 'locality_confirmed'

export const APPROVAL_GATE_DEFS: {
  key: ApprovalGateKey
  label: string
  description: string
}[] = [
  {
    key: 'email_verified',
    label: 'Email verification',
    description: 'Account email confirmed via Supabase Auth.',
  },
  {
    key: 'phone_verified',
    label: 'Phone OTP verification',
    description: 'Phone number verified via one-time passcode.',
  },
  {
    key: 'photos_reviewed',
    label: 'Photo review',
    description: 'Manual review of profile photos complete.',
  },
  {
    key: 'application_reviewed',
    label: 'Application text review',
    description: 'Manual review of application responses complete.',
  },
  {
    key: 'locality_confirmed',
    label: 'Locality confirmation',
    description: 'City/ZIP and local connection reviewed.',
  },
]

export type ApprovalGates = Partial<Record<ApprovalGateKey, ReviewStatus>>

export function emptyApprovalGates(): ApprovalGates {
  return {
    email_verified: 'incomplete',
    phone_verified: 'incomplete',
    photos_reviewed: 'incomplete',
    application_reviewed: 'incomplete',
    locality_confirmed: 'incomplete',
  }
}

export function parseApprovalGates(value: unknown): ApprovalGates {
  const base = emptyApprovalGates()
  if (!value || typeof value !== 'object') return base
  const raw = value as Record<string, unknown>
  for (const def of APPROVAL_GATE_DEFS) {
    const s = raw[def.key]
    if (
      s === 'incomplete' ||
      s === 'pending_review' ||
      s === 'approved' ||
      s === 'rejected' ||
      s === 'needs_followup'
    ) {
      base[def.key] = s
    }
  }
  return base
}

/** Map approval gates to public verification badges on approval. */
export function verificationStateFromGates(
  gates: ApprovalGates,
  existing?: VerificationState
): VerificationState {
  const state: VerificationState = { ...existing }
  if (gates.email_verified === 'approved') state.email = 'approved'
  if (gates.phone_verified === 'approved') state.phone = 'approved'
  if (gates.locality_confirmed === 'approved') state.locality = 'approved'
  if (gates.application_reviewed === 'approved') state.profile_reviewed = 'approved'
  if (gates.photos_reviewed === 'approved') state.photo_reviewed = 'approved'
  return state
}

export function canApproveMember(gates: ApprovalGates): {
  allowed: boolean
  blockers: string[]
} {
  const blockers: string[] = []
  for (const def of APPROVAL_GATE_DEFS) {
    const status = gates[def.key] ?? 'incomplete'
    if (status !== 'approved') {
      blockers.push(`${def.label} (${reviewStatusLabel(status)})`)
    }
  }
  return { allowed: blockers.length === 0, blockers }
}

/** Applicant-safe gate summary (no internal notes). */
export function applicantGateSummary(gates: ApprovalGates): {
  completed: number
  total: number
  label: string
} {
  const total = APPROVAL_GATE_DEFS.length
  const completed = APPROVAL_GATE_DEFS.filter(
    (d) => gates[d.key] === 'approved'
  ).length
  return {
    completed,
    total,
    label: `${completed} of ${total} verification steps complete`,
  }
}

// ---------------------------------------------------------------------------
// D. Locality confirmation
// ---------------------------------------------------------------------------

export type LocalityConfirmation = {
  city: string
  zip: string
  neighborhood: string
  workContext: string
  schoolOrCommunityContext: string
  socialLink: string
  reviewStatus: ReviewStatus
  reviewedAt: string | null
  adminNotes: string | null
}

export function emptyLocalityConfirmation(): LocalityConfirmation {
  return {
    city: '',
    zip: '',
    neighborhood: '',
    workContext: '',
    schoolOrCommunityContext: '',
    socialLink: '',
    reviewStatus: 'incomplete',
    reviewedAt: null,
    adminNotes: null,
  }
}

export function parseLocalityConfirmation(value: unknown): LocalityConfirmation {
  const base = emptyLocalityConfirmation()
  if (!value || typeof value !== 'object') return base
  const raw = value as Record<string, unknown>
  const status = raw.reviewStatus
  return {
    city: typeof raw.city === 'string' ? raw.city : base.city,
    zip: typeof raw.zip === 'string' ? raw.zip : base.zip,
    neighborhood:
      typeof raw.neighborhood === 'string' ? raw.neighborhood : base.neighborhood,
    workContext:
      typeof raw.workContext === 'string' ? raw.workContext : base.workContext,
    schoolOrCommunityContext:
      typeof raw.schoolOrCommunityContext === 'string'
        ? raw.schoolOrCommunityContext
        : base.schoolOrCommunityContext,
    socialLink:
      typeof raw.socialLink === 'string' ? raw.socialLink : base.socialLink,
    reviewStatus:
      status === 'incomplete' ||
      status === 'pending_review' ||
      status === 'approved' ||
      status === 'rejected' ||
      status === 'needs_followup'
        ? status
        : base.reviewStatus,
    reviewedAt:
      typeof raw.reviewedAt === 'string' ? raw.reviewedAt : base.reviewedAt,
    adminNotes:
      typeof raw.adminNotes === 'string' ? raw.adminNotes : base.adminNotes,
  }
}

export function localityFromDraft(draft: ApplicationDraft): LocalityConfirmation {
  return {
    ...emptyLocalityConfirmation(),
    city: draft.location.city.trim(),
    zip: draft.location.zipCode.trim(),
    neighborhood: draft.location.neighborhoodOrArea.trim(),
    workContext: [draft.workAndInterests.occupation, draft.workAndInterests.industry]
      .filter(Boolean)
      .join(' · '),
    schoolOrCommunityContext: draft.location.localConnection.trim(),
    socialLink: draft.location.socialLink.trim(),
  }
}

// ---------------------------------------------------------------------------
// E. Premium / vendor verification (private)
// ---------------------------------------------------------------------------

export type PremiumVerification = {
  id_verification: ReviewStatus
  liveness_match: ReviewStatus
  background_check: ReviewStatus
  consent_captured: boolean
  provider_reference: string | null
  reviewed_at: string | null
  admin_hold: boolean
  admin_hold_reason: string | null
  /** Public-safe badge when vendor path succeeds */
  public_badge: 'vendor_reviewed' | null
}

export function emptyPremiumVerification(): PremiumVerification {
  return {
    id_verification: 'incomplete',
    liveness_match: 'incomplete',
    background_check: 'incomplete',
    consent_captured: false,
    provider_reference: null,
    reviewed_at: null,
    admin_hold: false,
    admin_hold_reason: null,
    public_badge: null,
  }
}

export function parsePremiumVerification(value: unknown): PremiumVerification {
  const base = emptyPremiumVerification()
  if (!value || typeof value !== 'object') return base
  const raw = value as Record<string, unknown>
  const parseStatus = (v: unknown): ReviewStatus =>
    v === 'pending_review' ||
    v === 'approved' ||
    v === 'rejected' ||
    v === 'needs_followup'
      ? v
      : 'incomplete'

  const publicBadge = raw.public_badge
  return {
    id_verification: parseStatus(raw.id_verification),
    liveness_match: parseStatus(raw.liveness_match),
    background_check: parseStatus(raw.background_check),
    consent_captured: Boolean(raw.consent_captured),
    provider_reference:
      typeof raw.provider_reference === 'string' ? raw.provider_reference : null,
    reviewed_at:
      typeof raw.reviewed_at === 'string' ? raw.reviewed_at : null,
    admin_hold: Boolean(raw.admin_hold),
    admin_hold_reason:
      typeof raw.admin_hold_reason === 'string' ? raw.admin_hold_reason : null,
    public_badge:
      publicBadge === 'vendor_reviewed' ? 'vendor_reviewed' : null,
  }
}

export function premiumVerificationComplete(
  premium: PremiumVerification
): boolean {
  return (
    premium.consent_captured &&
    premium.id_verification === 'approved' &&
    premium.liveness_match === 'approved' &&
    premium.background_check === 'approved' &&
    !premium.admin_hold
  )
}

export function publicPremiumBadge(
  premium: PremiumVerification
): DisplayBadge | null {
  if (premium.public_badge === 'vendor_reviewed' && premiumVerificationComplete(premium)) {
    return {
      key: 'vendor_reviewed',
      label: 'Vendor reviewed',
      variant: 'premium',
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// F. Membership billing foundations
// ---------------------------------------------------------------------------

export type MembershipPlan = 'monthly' | 'quarterly' | 'annual' | null

export type ApplicationFeeStatus = 'unpaid' | 'paid' | 'waived' | 'not_required'

export type SubscriptionStatus =
  | 'none'
  | 'active'
  | 'grace'
  | 'past_due'
  | 'cancelled'

export type MembershipBilling = {
  tier:
    | 'applicant'
    | 'member'
    | 'inner_circle'
    | 'elite_circle'
    | 'premium_member'
    | 'vendor_reviewed'
    | 'community_partner'
  application_fee: {
    status: ApplicationFeeStatus
    amount_cents: number | null
    paid_at: string | null
  }
  plan: MembershipPlan
  subscription_status: SubscriptionStatus
  renewal_at: string | null
  cancelled_at: string | null
  billing_period_start: string | null
  billing_period_end: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_price_id: string | null
  trial_end: string | null
  plan_change_pending: 'upgrade' | 'downgrade' | null
  payment_failure: {
    active: boolean
    since: string | null
    reminder_sent_at: string | null
  }
}

export function emptyMembershipBilling(): MembershipBilling {
  return {
    tier: 'applicant',
    application_fee: {
      status: 'not_required',
      amount_cents: null,
      paid_at: null,
    },
    plan: null,
    subscription_status: 'none',
    renewal_at: null,
    cancelled_at: null,
    billing_period_start: null,
    billing_period_end: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    stripe_price_id: null,
    trial_end: null,
    plan_change_pending: null,
    payment_failure: {
      active: false,
      since: null,
      reminder_sent_at: null,
    },
  }
}

export function parseMembershipBilling(value: unknown): MembershipBilling {
  const base = emptyMembershipBilling()
  if (!value || typeof value !== 'object') return base
  const raw = value as Record<string, unknown>
  const fee = (raw.application_fee as Record<string, unknown>) ?? {}
  const failure = (raw.payment_failure as Record<string, unknown>) ?? {}

  const tier = raw.tier
  const feeStatus = fee.status
  const subStatus = raw.subscription_status
  const planChange = raw.plan_change_pending

  return {
    tier:
      tier === 'member' ||
      tier === 'inner_circle' ||
      tier === 'elite_circle' ||
      tier === 'premium_member' ||
      tier === 'vendor_reviewed' ||
      tier === 'community_partner'
        ? tier
        : base.tier,
    application_fee: {
      status:
        feeStatus === 'unpaid' ||
        feeStatus === 'paid' ||
        feeStatus === 'waived' ||
        feeStatus === 'not_required'
          ? feeStatus
          : base.application_fee.status,
      amount_cents:
        typeof fee.amount_cents === 'number' ? fee.amount_cents : null,
      paid_at: typeof fee.paid_at === 'string' ? fee.paid_at : null,
    },
    plan:
      raw.plan === 'monthly' ||
      raw.plan === 'quarterly' ||
      raw.plan === 'annual'
        ? raw.plan
        : null,
    subscription_status:
      subStatus === 'active' ||
      subStatus === 'grace' ||
      subStatus === 'past_due' ||
      subStatus === 'cancelled'
        ? subStatus
        : base.subscription_status,
    renewal_at:
      typeof raw.renewal_at === 'string' ? raw.renewal_at : null,
    cancelled_at:
      typeof raw.cancelled_at === 'string' ? raw.cancelled_at : null,
    billing_period_start:
      typeof raw.billing_period_start === 'string'
        ? raw.billing_period_start
        : null,
    billing_period_end:
      typeof raw.billing_period_end === 'string' ? raw.billing_period_end : null,
    stripe_customer_id:
      typeof raw.stripe_customer_id === 'string' ? raw.stripe_customer_id : null,
    stripe_subscription_id:
      typeof raw.stripe_subscription_id === 'string'
        ? raw.stripe_subscription_id
        : null,
    stripe_price_id:
      typeof raw.stripe_price_id === 'string' ? raw.stripe_price_id : null,
    trial_end: typeof raw.trial_end === 'string' ? raw.trial_end : null,
    plan_change_pending:
      planChange === 'upgrade' || planChange === 'downgrade'
        ? planChange
        : null,
    payment_failure: {
      active: Boolean(failure.active),
      since: typeof failure.since === 'string' ? failure.since : null,
      reminder_sent_at:
        typeof failure.reminder_sent_at === 'string'
          ? failure.reminder_sent_at
          : null,
    },
  }
}

export function billingStatusLabel(billing: MembershipBilling): string {
  if (billing.payment_failure.active) return 'Payment issue — action needed'
  if (billing.subscription_status === 'grace') return 'Grace period'
  if (billing.subscription_status === 'past_due') return 'Past due'
  if (billing.subscription_status === 'cancelled') return 'Cancelled'
  if (billing.tier === 'inner_circle' && billing.subscription_status === 'active') {
    return 'Inner Circle'
  }
  if (
    (billing.tier === 'elite_circle' || billing.tier === 'premium_member') &&
    billing.subscription_status === 'active'
  ) {
    return 'Elite Circle'
  }
  if (billing.subscription_status === 'active' && billing.plan) {
    const planLabel =
      billing.plan === 'monthly'
        ? 'Monthly'
        : billing.plan === 'quarterly'
          ? 'Quarterly'
          : 'Annual'
    return `${planLabel} member`
  }
  if (billing.application_fee.status === 'unpaid') return 'Application fee due'
  return 'Member (free)'
}

// ---------------------------------------------------------------------------
// Discovery helpers
// ---------------------------------------------------------------------------

export type DiscoveryIntent = 'dating' | 'networking' | 'friends' | 'mixed' | ''

export const DISCOVERY_INTENT_OPTIONS = [
  { value: '', label: 'Prefer not to say' },
  { value: 'dating', label: 'Dating' },
  { value: 'networking', label: 'Networking' },
  { value: 'friends', label: 'Friends' },
  { value: 'mixed', label: 'Mixed / open' },
] as const

export function discoveryIntentLabel(intent: DiscoveryIntent | string | null): string {
  const match = DISCOVERY_INTENT_OPTIONS.find((o) => o.value === intent)
  return match?.label ?? 'Not specified'
}

export function normalizeDiscoveryIntent(
  lookingFor: string
): DiscoveryIntent {
  const lower = lookingFor.trim().toLowerCase()
  if (lower.includes('dat')) return 'dating'
  if (lower.includes('network') || lower.includes('professional')) return 'networking'
  if (lower.includes('friend')) return 'friends'
  if (lower.includes('mixed') || lower.includes('open')) return 'mixed'
  if (
    lower === 'dating' ||
    lower === 'networking' ||
    lower === 'friends' ||
    lower === 'mixed'
  ) {
    return lower as DiscoveryIntent
  }
  return ''
}

export function birthYearFromDateOfBirth(dob: string): number | null {
  if (!dob?.trim()) return null
  const year = parseInt(dob.slice(0, 4), 10)
  return Number.isFinite(year) && year > 1900 && year <= new Date().getFullYear()
    ? year
    : null
}

export function ageFromBirthYear(birthYear: number | null): number | null {
  if (!birthYear) return null
  return new Date().getFullYear() - birthYear
}

export function discoveryColumnsFromDraft(draft: ApplicationDraft) {
  return {
    discovery_intent: normalizeDiscoveryIntent(draft.profile.lookingFor) || null,
    location_city: draft.location.city.trim() || null,
    location_zip: draft.location.zipCode.trim() || null,
    birth_year: birthYearFromDateOfBirth(draft.profile.dateOfBirth),
    discovery_interests: draft.workAndInterests.interests,
    discovery_industry: draft.workAndInterests.industry.trim() || null,
    locality_confirmation: localityFromDraft(draft),
  }
}

export function isMemberPubliclyVerified(state: VerificationState): boolean {
  return (
    state.profile_reviewed === 'approved' &&
    state.photo_reviewed === 'approved' &&
    state.locality === 'approved'
  )
}

export function applicantStatusSummary(status: ApplicationStatus): string {
  return applicationStatusLabel(status)
}
