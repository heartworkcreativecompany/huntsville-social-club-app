import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApplicationPhoto } from '@/lib/application'
import { resolveApplicationStatus, type ApplicationStatus } from '@/lib/application'
import type { Database } from '@/lib/database.types'
import { photosFromApplicationDraft, primaryMemberPhoto } from '@/lib/member-photos'
import {
  memberPublicIntentLabel,
  resolveMemberPublicIntents,
  type MemberPublicIntentValue,
} from '@/lib/member-public-intent'
import {
  ADMIN_NOT_AUTHORIZED_ERROR,
  isActiveMembershipAccessOverride,
  membershipAccessOverrideTierLabel,
  type MembershipAccessOverride,
} from '@/lib/membership-access-override'
import {
  loadAdminMemberBadges,
  type AdminMemberBadgeState,
} from '@/lib/recognition-badges/admin'
import { loadMembershipAccessOverrideForUser } from '@/lib/membership-access-override/admin'
import {
  billingStatusLabel,
  identityVerificationDisplayLabel,
  parseMembershipBilling,
  type MembershipBilling,
  type SubscriptionStatus,
} from '@/lib/membership-systems'
import { membershipStatusLabel, resolveMembershipStatus } from '@/lib/membership'

export const ADMIN_MEMBER_DETAIL_FORBIDDEN_KEYS = [
  'stripe_customer_id',
  'stripe_subscription_id',
  'stripe_price_id',
  'identity_verification_session_id',
  'identity_verification_last_error',
] as const

export type AdminSafeStripeSubscription = {
  tier: MembershipBilling['tier']
  tierLabel: string
  subscriptionStatus: SubscriptionStatus
  statusLabel: string
  cycleEnd: string | null
  cancelledAt: string | null
  plan: MembershipBilling['plan']
}

export type AdminMemberOverview = {
  id: string
  fullName: string
  email: string | null
  publicName: string
  bio: string | null
  cityArea: string | null
  intents: Array<{ value: MemberPublicIntentValue; label: string }>
  applicationStatus: ApplicationStatus
  publicProfileStatus: 'public' | 'not_public'
  role: string
  identityVerificationStatus: string
  identityVerificationLabel: string
  identityVerifiedAt: string | null
  membershipDisplayStatus: string
  membershipSource: 'complimentary_override' | 'stripe'
  stripeSubscription: AdminSafeStripeSubscription
  messagingSuspended: boolean
  messagingSuspensionReason: string | null
  profileRevisionStatus: string | null
  primaryPhoto: ApplicationPhoto | null
}

export type AdminMemberDetailState = {
  overview: AdminMemberOverview
  badges: AdminMemberBadgeState
  accessOverride: MembershipAccessOverride | null
}

export function toSafeAdminStripeSubscription(
  billing: MembershipBilling
): AdminSafeStripeSubscription {
  return {
    tier: billing.tier,
    tierLabel: billingStatusLabel(billing),
    subscriptionStatus: billing.subscription_status,
    statusLabel: billingStatusLabel(billing),
    cycleEnd: billing.billing_period_end ?? billing.renewal_at,
    cancelledAt: billing.cancelled_at,
    plan: billing.plan,
  }
}

export function stripAdminMemberDetailSecrets<T>(payload: T): T {
  return JSON.parse(
    JSON.stringify(payload, (key, value) => {
      if (
        (ADMIN_MEMBER_DETAIL_FORBIDDEN_KEYS as readonly string[]).includes(key)
      ) {
        return undefined
      }
      return value
    })
  ) as T
}

export function buildAdminMemberOverview(input: {
  id: string
  email: string | null
  fullName: string | null
  role: string | null
  applicationStatus: string | null
  membershipIntent: string | null
  locationArea: string | null
  locationCity: string | null
  connectionIntents: string[] | null
  connectionsOpenTo: string[] | null
  discoveryIntent: string | null
  identityVerificationStatus: string | null
  identityVerifiedAt: string | null
  membershipBilling: unknown
  messagingSuspendedAt: string | null
  messagingSuspensionReason: string | null
  profileRevisionStatus: string | null
  applicationDraft: unknown
  accessOverride: MembershipAccessOverride | null
  now?: Date
}): AdminMemberOverview {
  const billing = parseMembershipBilling(input.membershipBilling)
  const stripeSubscription = toSafeAdminStripeSubscription(billing)
  const applicationStatus = resolveApplicationStatus({
    application_status: input.applicationStatus,
    role: input.role,
  })
  const overrideActive = isActiveMembershipAccessOverride(
    input.accessOverride,
    input.now
  )
  const fullName = input.fullName?.trim() || input.email || 'Member'
  const intents = resolveMemberPublicIntents({
    connection_intents: input.connectionIntents,
    connections_open_to: input.connectionsOpenTo,
    discovery_intent: input.discoveryIntent,
  })
  const photos = photosFromApplicationDraft(input.applicationDraft)

  return stripAdminMemberDetailSecrets({
    id: input.id,
    fullName,
    email: input.email,
    publicName: input.fullName?.trim() || 'Member',
    bio: input.membershipIntent?.trim() || null,
    cityArea:
      input.locationCity?.trim() || input.locationArea?.trim() || null,
    intents: intents.map((value) => ({
      value,
      label: memberPublicIntentLabel(value),
    })),
    applicationStatus,
    publicProfileStatus:
      applicationStatus === 'approved' ? 'public' : 'not_public',
    role: input.role ?? 'member',
    identityVerificationStatus: input.identityVerificationStatus ?? 'not_started',
    identityVerificationLabel: identityVerificationDisplayLabel(
      input.identityVerificationStatus
    ),
    identityVerifiedAt: input.identityVerifiedAt,
    membershipDisplayStatus:
      overrideActive && input.accessOverride
        ? `Complimentary access override — ${membershipAccessOverrideTierLabel(input.accessOverride.tier)}`
        : membershipStatusLabel(
          resolveMembershipStatus({
            application_status: input.applicationStatus,
            role: input.role,
          })
        ),
    membershipSource: overrideActive ? 'complimentary_override' : 'stripe',
    stripeSubscription,
    messagingSuspended: Boolean(input.messagingSuspendedAt),
    messagingSuspensionReason: input.messagingSuspensionReason,
    profileRevisionStatus: input.profileRevisionStatus,
    primaryPhoto: primaryMemberPhoto(photos),
  })
}

export async function loadAdminMemberDetail(
  admin: SupabaseClient<Database>,
  input: { isAdmin: boolean; memberId: string }
): Promise<
  | { ok: true; data: AdminMemberDetailState }
  | { ok: false; error: string }
> {
  if (!input.isAdmin) {
    return { ok: false, error: ADMIN_NOT_AUTHORIZED_ERROR }
  }

  const { data: member, error } = await admin
    .from('profiles')
    .select(
      'id, email, full_name, role, application_status, membership_intent, location_area, location_city, connection_intents, connections_open_to, discovery_intent, identity_verification_status, identity_verified_at, membership_billing, messaging_suspended_at, messaging_suspension_reason, profile_revision_status, application_draft'
    )
    .eq('id', input.memberId)
    .maybeSingle()

  if (error) {
    return { ok: false, error: error.message }
  }
  if (!member) {
    return { ok: false, error: 'Member not found.' }
  }

  const [badges, overrideResult] = await Promise.all([
    loadAdminMemberBadges(admin, {
      isAdmin: true,
      memberId: input.memberId,
    }),
    loadMembershipAccessOverrideForUser(admin, {
      isAdmin: true,
      memberId: input.memberId,
    }),
  ])

  if (!badges.ok) {
    return badges
  }
  if (!overrideResult.ok) {
    return overrideResult
  }

  return {
    ok: true,
    data: stripAdminMemberDetailSecrets({
      overview: buildAdminMemberOverview({
        id: member.id,
        email: member.email,
        fullName: member.full_name,
        role: member.role,
        applicationStatus: member.application_status,
        membershipIntent: member.membership_intent,
        locationArea: member.location_area,
        locationCity: member.location_city,
        connectionIntents: member.connection_intents,
        connectionsOpenTo: member.connections_open_to,
        discoveryIntent: member.discovery_intent,
        identityVerificationStatus: member.identity_verification_status,
        identityVerifiedAt: member.identity_verified_at,
        membershipBilling: member.membership_billing,
        messagingSuspendedAt: member.messaging_suspended_at,
        messagingSuspensionReason: member.messaging_suspension_reason,
        profileRevisionStatus: member.profile_revision_status,
        applicationDraft: member.application_draft,
        accessOverride: overrideResult.override,
      }),
      badges: badges.data,
      accessOverride: overrideResult.override,
    }),
  }
}
