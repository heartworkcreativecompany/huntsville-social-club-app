import {
  normalizeRemovedEmail,
  RESTORE_UNBAN_FAILED_MESSAGE,
  splitUpcomingRsvps,
  validateMemberRestore,
  validatePermanentRemoval,
  type AuthBanState,
  type FreeRsvpDecision,
  type PaidTicketDecision,
  type RemovalReasonCategory,
  type RemovalTarget,
  type StripeCancellationState,
} from '@/lib/member-removal'

export type RemovalRunDeps = {
  now: () => Date
  loadTarget: (
    userId: string
  ) => Promise<{ target: RemovalTarget | null; error: string | null }>
  markRemoved: (
    userId: string,
    patch: {
      removedAt: string
      removedBy: string
      category: RemovalReasonCategory
      internalNote: string
      stripeResult: StripeCancellationState
      authResult: AuthBanState
    }
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  recordRemovalOutcome: (
    userId: string,
    patch: {
      stripeResult: StripeCancellationState
      authResult: AuthBanState
    }
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  discardRemoval: (
    userId: string
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  clearRemoved: (
    userId: string
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  recordRestore: (
    userId: string,
    patch: {
      restoredAt: string
      restoredBy: string
      restoreNote: string
    }
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  recordAuthResult: (
    userId: string,
    authResult: AuthBanState
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  saveRemovedEmail: (input: {
    emailNormalized: string
    profileId: string
    removedAt: string
    removedBy: string
  }) => Promise<{ ok: true } | { ok: false; error: string }>
  deleteRemovedEmail: (
    emailNormalized: string
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  suspendMessaging: (
    targetId: string,
    category: RemovalReasonCategory
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  loadUpcomingAttendance: (userId: string) => Promise<
    | {
        ok: true
        attendees: Array<{
          id: string
          event_id: string
          status: string
          payment_status: string | null
          amount_paid_cents: number | null
        }>
        events: Array<{
          id: string
          title: string | null
          starts_at: string
          fee_cents: number | null
        }>
      }
    | { ok: false; error: string }
  >
  cancelFreeRsvps: (
    attendeeIds: string[],
    cancelledAt: string
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  cancelSubscription: (
    billing: unknown
  ) => Promise<StripeCancellationState>
  banAuth: (userId: string) => Promise<Extract<AuthBanState, 'banned' | 'failed'>>
  unbanAuth: (userId: string) => Promise<Extract<AuthBanState, 'lifted' | 'failed'>>
  logRemoval: (input: {
    actorId: string
    targetId: string
    category: RemovalReasonCategory
  }) => Promise<{ ok: true } | { ok: false; error: string }>
  logRestore: (input: {
    actorId: string
    targetId: string
    note: string
  }) => Promise<{ ok: true } | { ok: false; error: string }>
}

export type PermanentRemovalSuccess = {
  ok: true
  paidTickets: PaidTicketDecision[]
  freeRsvpsNeedingCancellation: FreeRsvpDecision[]
  stripeCancellation: StripeCancellationState
  authBan: Extract<AuthBanState, 'banned' | 'failed'>
  messagingSuspended: boolean
}

export async function executePermanentRemoval(
  input: {
    actorIsAdmin: boolean
    actorId: string
    targetUserId: string
    category: string
    internalNote: string
    confirmationText: string
  },
  deps: RemovalRunDeps
): Promise<PermanentRemovalSuccess | { ok: false; error: string }> {
  const loaded = await deps.loadTarget(input.targetUserId)
  if (loaded.error) return { ok: false, error: loaded.error }

  const guard = validatePermanentRemoval({
    actorIsAdmin: input.actorIsAdmin,
    actorId: input.actorId,
    target: loaded.target,
    category: input.category,
    confirmationText: input.confirmationText,
  })
  if (!guard.ok) return guard

  const target = loaded.target
  if (!target) return { ok: false, error: 'Member not found.' }

  const removedAt = deps.now().toISOString()
  const attendance = await deps.loadUpcomingAttendance(target.id)
  if (!attendance.ok) return { ok: false, error: attendance.error }

  const eventsById = new Map(
    attendance.events.map((event) => [
      event.id,
      {
        starts_at: event.starts_at,
        title: event.title,
        fee_cents: event.fee_cents,
      },
    ])
  )
  const split = splitUpcomingRsvps(
    attendance.attendees,
    eventsById,
    deps.now()
  )

  const email = normalizeRemovedEmail(target.email)
  const marked = await deps.markRemoved(target.id, {
    removedAt,
    removedBy: input.actorId,
    category: guard.category,
    internalNote: input.internalNote,
    stripeResult: 'skipped',
    authResult: 'failed',
  })
  if (!marked.ok) return marked

  if (email) {
    const saved = await deps.saveRemovedEmail({
      emailNormalized: email,
      profileId: target.id,
      removedAt,
      removedBy: input.actorId,
    })
    if (!saved.ok) {
      await deps.discardRemoval(target.id)
      return saved
    }
  }

  let messagingSuspended = Boolean(target.messagingSuspendedAt)
  if (!target.messagingSuspendedAt) {
    const suspended = await deps.suspendMessaging(target.id, guard.category)
    messagingSuspended = suspended.ok
  }

  let freeRsvpsNeedingCancellation: FreeRsvpDecision[] = []
  if (split.freeIds.length > 0) {
    const cancelled = await deps.cancelFreeRsvps(split.freeIds, removedAt)
    if (!cancelled.ok) {
      freeRsvpsNeedingCancellation = split.freeRsvps
    }
  }

  const stripeCancellation = await deps.cancelSubscription(
    target.membershipBilling
  )
  const authBan = await deps.banAuth(target.id)
  await deps.recordRemovalOutcome(target.id, {
    stripeResult: stripeCancellation,
    authResult: authBan,
  })

  await deps.logRemoval({
    actorId: input.actorId,
    targetId: target.id,
    category: guard.category,
  })

  return {
    ok: true,
    paidTickets: split.paidTickets,
    freeRsvpsNeedingCancellation,
    stripeCancellation,
    authBan,
    messagingSuspended,
  }
}

export async function executeMemberRestore(
  input: {
    actorIsAdmin: boolean
    actorId: string
    targetUserId: string
    note: string
    confirmationText: string
  },
  deps: RemovalRunDeps
): Promise<
  | { ok: true; authBan: 'lifted' }
  | { ok: false; error: string }
> {
  const loaded = await deps.loadTarget(input.targetUserId)
  if (loaded.error) return { ok: false, error: loaded.error }

  const guard = validateMemberRestore({
    actorIsAdmin: input.actorIsAdmin,
    actorId: input.actorId,
    target: loaded.target,
    note: input.note,
    confirmationText: input.confirmationText,
  })
  if (!guard.ok) return guard

  const target = loaded.target
  if (!target) return { ok: false, error: 'Member not found.' }

  const restoredAt = deps.now().toISOString()
  const recorded = await deps.recordRestore(target.id, {
    restoredAt,
    restoredBy: input.actorId,
    restoreNote: input.note.trim(),
  })
  if (!recorded.ok) return recorded

  const email = normalizeRemovedEmail(target.email)
  if (email) {
    const deleted = await deps.deleteRemovedEmail(email)
    if (!deleted.ok) return deleted
  }

  const authBan = await deps.unbanAuth(target.id)
  if (authBan !== 'lifted') {
    await deps.recordAuthResult(target.id, 'unban_failed')
    return { ok: false, error: RESTORE_UNBAN_FAILED_MESSAGE }
  }

  const recordedAuth = await deps.recordAuthResult(target.id, 'lifted')
  if (!recordedAuth.ok) return recordedAuth

  const cleared = await deps.clearRemoved(target.id)
  if (!cleared.ok) return cleared

  await deps.logRestore({
    actorId: input.actorId,
    targetId: target.id,
    note: input.note.trim(),
  })

  return { ok: true, authBan: 'lifted' }
}

export function publicRemovalResult(
  result: PermanentRemovalSuccess
): PermanentRemovalSuccess {
  return {
    ok: true,
    paidTickets: result.paidTickets,
    freeRsvpsNeedingCancellation: result.freeRsvpsNeedingCancellation,
    stripeCancellation: result.stripeCancellation,
    authBan: result.authBan,
    messagingSuspended: result.messagingSuspended,
  }
}
