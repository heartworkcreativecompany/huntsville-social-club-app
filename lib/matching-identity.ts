import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  acceptedIdentityStatus,
  type AcceptedIdentityStatus,
} from '@/lib/identity-verification'
import { loadAcceptedIdentityStatuses } from '@/lib/identity-verification-access'

type IdentityClient = SupabaseClient<Database>

export const MATCHING_IDENTITY_HREF = '/profile#identity-verification' as const

export const MATCHING_IDENTITY_CTA = 'Verify my identity' as const

export const MATCHING_IDENTITY_REVIEW_CTA = 'Review identity verification' as const

export const MATCHING_IDENTITY_REQUIRED_DETAIL =
  'Verify your identity to take part in matching. Your Circle membership is active, but matching will unlock after your identity is verified.' as const

export const MATCHING_IDENTITY_PENDING_DETAIL =
  'Your identity verification is still pending. Your Circle membership is active, but matching will unlock after your identity is verified.' as const

export const MATCHING_IDENTITY_UNAVAILABLE_DETAIL =
  'Identity verification could not be confirmed. Matching stays unavailable until it can be checked.' as const

export const MATCHING_IDENTITY_REQUIRED_WITHOUT_ACTIVE_MEMBERSHIP =
  'Verify your identity to take part in matching. Matching will unlock after your identity is verified.' as const

export const MATCHING_IDENTITY_PENDING_WITHOUT_ACTIVE_MEMBERSHIP =
  'Your identity verification is still pending. Matching will unlock after your identity is verified.' as const

export type MatchingIdentityPresentation = {
  status: AcceptedIdentityStatus
  stripeStatus: string | null
}

export type MatchingIdentityGate =
  | { state: 'allowed' }
  | {
      state: 'identity_required' | 'identity_pending' | 'identity_unavailable'
      headline: string
      detail: string
      ctaHref: typeof MATCHING_IDENTITY_HREF
      ctaLabel: string
    }

/**
 * Payment, Circle tier, and complimentary access do not satisfy this check.
 * Only the authoritative accepted-identity result does. Unavailable fails closed.
 */
export function acceptedIdentityAllowsMatching(
  status: AcceptedIdentityStatus | null | undefined
): boolean {
  return status === 'verified'
}

export function matchingIdentityGate(input: {
  status: AcceptedIdentityStatus | null | undefined
  stripeStatus?: string | null
  membershipConfirmedActive: boolean
}): MatchingIdentityGate {
  const status = input.status ?? 'unavailable'
  if (acceptedIdentityAllowsMatching(status)) {
    return { state: 'allowed' }
  }

  if (status === 'unavailable') {
    return {
      state: 'identity_unavailable',
      headline: 'Verify your identity to take part in matching',
      detail: MATCHING_IDENTITY_UNAVAILABLE_DETAIL,
      ctaHref: MATCHING_IDENTITY_HREF,
      ctaLabel: MATCHING_IDENTITY_REVIEW_CTA,
    }
  }

  const pending = input.stripeStatus === 'processing'
  if (pending && input.membershipConfirmedActive) {
    return {
      state: 'identity_pending',
      headline: 'Verify your identity to take part in matching',
      detail: MATCHING_IDENTITY_PENDING_DETAIL,
      ctaHref: MATCHING_IDENTITY_HREF,
      ctaLabel: MATCHING_IDENTITY_CTA,
    }
  }
  if (pending) {
    return {
      state: 'identity_pending',
      headline: 'Verify your identity to take part in matching',
      detail: MATCHING_IDENTITY_PENDING_WITHOUT_ACTIVE_MEMBERSHIP,
      ctaHref: MATCHING_IDENTITY_HREF,
      ctaLabel: MATCHING_IDENTITY_CTA,
    }
  }
  if (input.membershipConfirmedActive) {
    return {
      state: 'identity_required',
      headline: 'Verify your identity to take part in matching',
      detail: MATCHING_IDENTITY_REQUIRED_DETAIL,
      ctaHref: MATCHING_IDENTITY_HREF,
      ctaLabel: MATCHING_IDENTITY_CTA,
    }
  }
  return {
    state: 'identity_required',
    headline: 'Verify your identity to take part in matching',
    detail: MATCHING_IDENTITY_REQUIRED_WITHOUT_ACTIVE_MEMBERSHIP,
    ctaHref: MATCHING_IDENTITY_HREF,
    ctaLabel: MATCHING_IDENTITY_CTA,
  }
}

/**
 * Recipient must be verified or nothing new is published.
 * A candidate who is not verified is held, not published and not deleted.
 * A failed lookup publishes nothing.
 */
export function partitionMatchingPublication(input: {
  recipientId: string
  candidateIds: string[]
  statuses: ReadonlyMap<string, AcceptedIdentityStatus> | null
}):
  | { ok: false }
  | { ok: true; publishIds: string[]; heldIds: string[] } {
  if (!input.statuses) return { ok: false }
  const recipient = input.statuses.get(input.recipientId) ?? 'unavailable'
  if (!acceptedIdentityAllowsMatching(recipient)) {
    return {
      ok: true,
      publishIds: [],
      heldIds: [...input.candidateIds],
    }
  }

  const publishIds: string[] = []
  const heldIds: string[] = []
  for (const candidateId of input.candidateIds) {
    const status = input.statuses.get(candidateId) ?? 'unavailable'
    if (acceptedIdentityAllowsMatching(status)) {
      publishIds.push(candidateId)
    } else {
      heldIds.push(candidateId)
    }
  }
  return { ok: true, publishIds, heldIds }
}

export async function loadMatchingIdentityPresentation(
  admin: IdentityClient | null | undefined,
  profileId: string
): Promise<MatchingIdentityPresentation> {
  if (!admin || !profileId) {
    return { status: 'unavailable', stripeStatus: null }
  }

  const stripe = await admin
    .from('profiles')
    .select('identity_verification_status')
    .eq('id', profileId)
    .maybeSingle()

  if (stripe.error) {
    return { status: 'unavailable', stripeStatus: null }
  }

  const statuses = await loadAcceptedIdentityStatuses(admin, [profileId])
  return {
    status: statuses.get(profileId) ?? 'unavailable',
    stripeStatus: stripe.data?.identity_verification_status ?? null,
  }
}

/**
 * Batch lookup for pools and publication. A query error fails the whole
 * operation. A missing profile row is unverified, not unavailable.
 */
export async function visibleMatchingCandidateIds(
  admin: IdentityClient | null | undefined,
  viewerId: string,
  candidateIds: string[]
): Promise<{ ok: true; visibleIds: Set<string> } | { ok: false }> {
  const identity = await loadMatchingIdentityMap(admin, [viewerId, ...candidateIds])
  if (!identity.ok) return { ok: false }
  if (!acceptedIdentityAllowsMatching(identity.statuses.get(viewerId))) {
    return { ok: true, visibleIds: new Set() }
  }
  return {
    ok: true,
    visibleIds: new Set(
      candidateIds.filter((candidateId) =>
        acceptedIdentityAllowsMatching(identity.statuses.get(candidateId))
      )
    ),
  }
}

export async function loadMatchingIdentityMap(
  admin: IdentityClient | null | undefined,
  profileIds: string[]
): Promise<
  | { ok: true; statuses: Map<string, AcceptedIdentityStatus> }
  | { ok: false }
> {
  const uniqueIds = [...new Set(profileIds.filter(Boolean))]
  if (uniqueIds.length === 0) {
    return { ok: true, statuses: new Map() }
  }
  if (!admin) return { ok: false }

  const stripe = await admin
    .from('profiles')
    .select('id, identity_verification_status')
    .in('id', uniqueIds)

  if (stripe.error) return { ok: false }

  const inPerson = await admin
    .from('in_person_identity_verifications')
    .select('profile_id')
    .in('profile_id', uniqueIds)
    .eq('method', 'in_person')
    .eq('status', 'verified')
    .is('revoked_at', null)

  if (inPerson.error) return { ok: false }

  const stripeById = new Map(
    (stripe.data ?? []).map((row) => [row.id, row.identity_verification_status])
  )
  const activeInPerson = new Set((inPerson.data ?? []).map((row) => row.profile_id))
  const statuses = new Map<string, AcceptedIdentityStatus>()
  for (const id of uniqueIds) {
    statuses.set(
      id,
      acceptedIdentityStatus({
        stripeStatus: stripeById.get(id) ?? null,
        inPersonLookup: {
          ok: true,
          record: activeInPerson.has(id)
            ? { status: 'verified', revokedAt: null }
            : null,
        },
      })
    )
  }
  return { ok: true, statuses }
}
