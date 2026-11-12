export const REMOVAL_REASON_CATEGORIES = [
  'Sexual content',
  'Harassment',
  'Scam or fraud',
  'Trafficking or exploitation concern',
  'Fake profile or impersonation',
  'Repeat violations',
  'Other',
] as const

export type RemovalReasonCategory = (typeof REMOVAL_REASON_CATEGORIES)[number]

export const REMOVED_ACCOUNT_MESSAGE =
  'This account is no longer active. Contact hello@huntsvillesocialclub.com.'

export const REMOVED_APPLICATION_MESSAGE =
  "We're unable to accept an application for this account. Contact hello@huntsvillesocialclub.com with questions."

export const ACCOUNT_CHECK_UNAVAILABLE_MESSAGE =
  'We could not check this account right now. Try again in a moment.'

export const STRIPE_CANCELLATION_FAILED_MESSAGE =
  'The membership subscription could not be cancelled. The member is still removed. Review the subscription in Stripe.'

export const AUTH_BAN_FAILED_MESSAGE =
  'The sign-in ban could not be applied. The member is still removed.'

export const REMOVAL_CONFIRMATION = 'REMOVE'
export const RESTORE_CONFIRMATION = 'RESTORE'

export const AUTH_BAN_DURATION = '876000h'

export type StripeCancellationState = 'cancelled' | 'skipped' | 'failed'
export type AuthBanState = 'banned' | 'failed' | 'lifted'

export type StoredRemovalReason = {
  category: RemovalReasonCategory
  note: string | null
  stripeCancellation: StripeCancellationState
  authBan: AuthBanState
}

export type PaidTicketDecision = {
  eventId: string
  eventTitle: string
  eventStartsAt: string
  amountCents: number
}

export type RemovalTarget = {
  id: string
  email: string | null
  role: string | null
  removedAt: string | null
  messagingSuspendedAt: string | null
  membershipBilling: unknown
}

export function normalizeRemovedEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase()
}

export function isRemovalReasonCategory(
  value: string
): value is RemovalReasonCategory {
  return (REMOVAL_REASON_CATEGORIES as readonly string[]).includes(value)
}

export function serializeRemovalReason(record: StoredRemovalReason): string {
  return JSON.stringify({
    category: record.category,
    note: record.note?.trim() || null,
    stripeCancellation: record.stripeCancellation,
    authBan: record.authBan,
  })
}

/** Admin-visible fields only. The internal note is never returned. */
export function parseRemovalReason(value: string | null | undefined): {
  category: RemovalReasonCategory | null
  stripeCancellation: StripeCancellationState | null
  authBan: AuthBanState | null
} {
  if (!value) {
    return { category: null, stripeCancellation: null, authBan: null }
  }
  try {
    const parsed = JSON.parse(value) as {
      category?: unknown
      stripeCancellation?: unknown
      authBan?: unknown
    }
    const category =
      typeof parsed.category === 'string' &&
      isRemovalReasonCategory(parsed.category)
        ? parsed.category
        : null
    const stripeCancellation =
      parsed.stripeCancellation === 'cancelled' ||
      parsed.stripeCancellation === 'skipped' ||
      parsed.stripeCancellation === 'failed'
        ? parsed.stripeCancellation
        : null
    const authBan =
      parsed.authBan === 'banned' ||
      parsed.authBan === 'failed' ||
      parsed.authBan === 'lifted'
        ? parsed.authBan
        : null
    return { category, stripeCancellation, authBan }
  } catch {
    return { category: null, stripeCancellation: null, authBan: null }
  }
}

export function applicationBlockForRemovedEmail(blocked: boolean): string | null {
  return blocked ? REMOVED_APPLICATION_MESSAGE : null
}

export async function applicationBlockForEmailLookup(
  email: string | null | undefined,
  lookup: (
    normalized: string
  ) => Promise<
    { status: 'clear' } | { status: 'blocked' } | { status: 'unavailable' }
  >
): Promise<string | null> {
  const normalized = normalizeRemovedEmail(email)
  if (!normalized) return null
  const result = await lookup(normalized)
  if (result.status === 'blocked') return REMOVED_APPLICATION_MESSAGE
  if (result.status === 'unavailable') return ACCOUNT_CHECK_UNAVAILABLE_MESSAGE
  return null
}

export function validatePermanentRemoval(input: {
  actorIsAdmin: boolean
  actorId: string
  target: RemovalTarget | null
  category: string
  confirmationText: string
}): { ok: true; category: RemovalReasonCategory } | { ok: false; error: string } {
  if (!input.actorIsAdmin) {
    return { ok: false, error: 'Administrator access required.' }
  }
  if (!input.target) {
    return { ok: false, error: 'Member not found.' }
  }
  if (input.confirmationText.trim() !== REMOVAL_CONFIRMATION) {
    return { ok: false, error: 'Type REMOVE to confirm.' }
  }
  if (!isRemovalReasonCategory(input.category)) {
    return { ok: false, error: 'Choose a reason category.' }
  }
  if (input.actorId === input.target.id) {
    return { ok: false, error: 'You cannot remove your own account.' }
  }
  if (input.target.role === 'admin') {
    return { ok: false, error: 'Administrator accounts cannot be removed.' }
  }
  if (input.target.removedAt) {
    return { ok: false, error: 'This member is already removed.' }
  }
  return { ok: true, category: input.category }
}

export function validateMemberRestore(input: {
  actorIsAdmin: boolean
  actorId: string
  target: RemovalTarget | null
  note: string
  confirmationText: string
}): { ok: true } | { ok: false; error: string } {
  if (!input.actorIsAdmin) {
    return { ok: false, error: 'Administrator access required.' }
  }
  if (!input.target) {
    return { ok: false, error: 'Member not found.' }
  }
  if (input.confirmationText.trim() !== RESTORE_CONFIRMATION) {
    return { ok: false, error: 'Type RESTORE to confirm.' }
  }
  if (!input.note.trim()) {
    return { ok: false, error: 'A note is required to restore a member.' }
  }
  if (input.actorId === input.target.id) {
    return { ok: false, error: 'You cannot restore your own account from this screen.' }
  }
  if (!input.target.removedAt) {
    return { ok: false, error: 'This member is not removed.' }
  }
  return { ok: true }
}

export function isPaidEventTicket(row: {
  payment_status: string | null
  amount_paid_cents: number | null
}): boolean {
  if ((row.amount_paid_cents ?? 0) > 0) return true
  const status = row.payment_status?.trim().toLowerCase()
  return status === 'paid' || status === 'succeeded' || status === 'complete'
}

export function isOpenRsvpStatus(status: string | null | undefined): boolean {
  return status === 'going' || status === 'maybe'
}

export function splitUpcomingRsvps<T extends {
  id: string
  status: string
  payment_status: string | null
  amount_paid_cents: number | null
  event_id: string
}>(
  attendees: T[],
  eventsById: Map<string, { starts_at: string; title: string | null; fee_cents: number | null }>,
  now: Date
): { freeIds: string[]; paidTickets: PaidTicketDecision[] } {
  const freeIds: string[] = []
  const paidTickets: PaidTicketDecision[] = []
  for (const row of attendees) {
    if (!isOpenRsvpStatus(row.status)) continue
    const event = eventsById.get(row.event_id)
    if (!event) continue
    const starts = Date.parse(event.starts_at)
    if (Number.isNaN(starts) || starts <= now.getTime()) continue
    if (isPaidEventTicket(row)) {
      paidTickets.push({
        eventId: row.event_id,
        eventTitle: event.title?.trim() || 'Event',
        eventStartsAt: event.starts_at,
        amountCents:
          (row.amount_paid_cents ?? 0) > 0
            ? row.amount_paid_cents ?? 0
            : event.fee_cents ?? 0,
      })
    } else {
      freeIds.push(row.id)
    }
  }
  return { freeIds, paidTickets }
}

export function memberFacingAttendeeRows<T extends { user_id: string }>(
  rows: T[],
  removedIds: ReadonlySet<string>,
  viewerIsAdmin: boolean
): T[] {
  if (viewerIsAdmin) return rows
  return rows.filter((row) => !removedIds.has(row.user_id))
}

export function adminAttendeeLabel(
  name: string,
  userId: string,
  removedIds: ReadonlySet<string>,
  viewerIsAdmin: boolean
): string {
  if (viewerIsAdmin && removedIds.has(userId)) {
    return `${name} (Removed)`
  }
  return name
}

export function visibleMatchCandidateIds(
  candidateIds: string[],
  removedIds: ReadonlySet<string>,
  identityVisibleIds: ReadonlySet<string>
): Set<string> {
  return new Set(
    candidateIds.filter(
      (id) => identityVisibleIds.has(id) && !removedIds.has(id)
    )
  )
}

export function inboxWithoutRemovedMembers<T extends { otherUserId: string }>(
  previews: T[],
  removedIds: ReadonlySet<string>
): T[] {
  return previews.filter((preview) => !removedIds.has(preview.otherUserId))
}

export function directoryHidesRemovedMember(removedAt: string | null | undefined): boolean {
  return removedAt != null
}

export const REMOVED_ADMIN_BADGE = 'Removed'

export function adminRemovalFollowUp(input: {
  stripeCancellation: StripeCancellationState | null
  authBan: AuthBanState | null
}): string[] {
  const lines: string[] = []
  if (input.stripeCancellation === 'failed') {
    lines.push(STRIPE_CANCELLATION_FAILED_MESSAGE)
  }
  if (input.authBan === 'failed') {
    lines.push(AUTH_BAN_FAILED_MESSAGE)
  }
  return lines
}

export const RESTORE_DOES_NOT_RESTORE_COPY =
  'Restore lets this person sign in and apply again. It does not restore messaging, the membership subscription, or event RSVPs.'
