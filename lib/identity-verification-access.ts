import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  acceptedIdentityStatus,
  classifyInPersonLookup,
  type AcceptedIdentityStatus,
  type InPersonIdentityRecord,
} from '@/lib/identity-verification'

type IdentityClient = SupabaseClient<Database>

const CHUNK_SIZE = 100

function chunks<T>(values: T[], size: number): T[][] {
  const groups: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    groups.push(values.slice(index, index + size))
  }
  return groups
}

/**
 * Active in-person row, or null when the lookup succeeds and no active row exists.
 * A query error is unavailable, including a missing table. It is not "no row".
 */
export async function lookupActiveInPersonIdentity(
  admin: IdentityClient,
  profileId: string
): Promise<
  | { ok: true; record: InPersonIdentityRecord | null }
  | { ok: false }
> {
  const { data, error } = await admin
    .from('in_person_identity_verifications')
    .select('status, revoked_at, method')
    .eq('profile_id', profileId)
    .eq('method', 'in_person')
    .eq('status', 'verified')
    .is('revoked_at', null)
    .maybeSingle()

  if (error) return { ok: false }
  return classifyInPersonLookup({
    error: null,
    record: data ? { status: 'verified', revokedAt: null } : null,
  })
}

export async function loadAcceptedIdentityStatus(
  admin: IdentityClient | null | undefined,
  profileId: string
): Promise<AcceptedIdentityStatus> {
  if (!admin || !profileId) return 'unavailable'

  const stripe = await admin
    .from('profiles')
    .select('identity_verification_status')
    .eq('id', profileId)
    .maybeSingle()

  if (stripe.error) return 'unavailable'

  const inPerson = await lookupActiveInPersonIdentity(admin, profileId)
  return acceptedIdentityStatus({
    stripeStatus: stripe.data?.identity_verification_status,
    inPersonLookup: inPerson,
  })
}

/**
 * Batch decision for public badges. A failed Stripe or in-person read
 * marks every requested profile unavailable. The returned status never
 * includes the method, session, or approver.
 */
export async function loadAcceptedIdentityStatuses(
  admin: IdentityClient | null | undefined,
  profileIds: string[]
): Promise<Map<string, AcceptedIdentityStatus>> {
  const uniqueIds = [...new Set(profileIds.filter(Boolean))]
  const statuses = new Map<string, AcceptedIdentityStatus>()
  if (uniqueIds.length === 0) return statuses

  if (!admin) {
    for (const id of uniqueIds) statuses.set(id, 'unavailable')
    return statuses
  }

  const stripeById = new Map<string, string | null>()
  const activeInPerson = new Set<string>()

  for (const ids of chunks(uniqueIds, CHUNK_SIZE)) {
    const stripe = await admin
      .from('profiles')
      .select('id, identity_verification_status')
      .in('id', ids)

    if (stripe.error) {
      for (const id of uniqueIds) statuses.set(id, 'unavailable')
      return statuses
    }

    for (const row of stripe.data ?? []) {
      stripeById.set(row.id, row.identity_verification_status)
    }

    const inPerson = await admin
      .from('in_person_identity_verifications')
      .select('profile_id')
      .in('profile_id', ids)
      .eq('method', 'in_person')
      .eq('status', 'verified')
      .is('revoked_at', null)

    if (inPerson.error) {
      for (const id of uniqueIds) statuses.set(id, 'unavailable')
      return statuses
    }

    for (const row of inPerson.data ?? []) {
      activeInPerson.add(row.profile_id)
    }
  }

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

  return statuses
}

export async function attachPublicIdentityDecisions<T extends { id: string }>(
  admin: IdentityClient | null | undefined,
  members: T[]
): Promise<Array<T & { publicIdentity: AcceptedIdentityStatus }>> {
  const statuses = await loadAcceptedIdentityStatuses(
    admin,
    members.map((member) => member.id)
  )
  return members.map((member) => ({
    ...member,
    publicIdentity: statuses.get(member.id) ?? 'unavailable',
  }))
}
