/**
 * Audit lease rules shared by the Edge Function and its tests.
 *
 * next_attempt_at null means the row is not scheduled. It is never "due now".
 * Initial pending work sets next_attempt_at to the current time.
 * Exhausted work (attempt_count >= 5) sets next_attempt_at null and cannot
 * be acquired. Historic, obsolete, in-flight, accepted, and unknown rows
 * also use null and are not acquisition candidates.
 */

export const MAX_STATUS_EMAIL_ATTEMPTS = 5
export const PRE_SEND_LEASE_SECONDS = 30
export const SUBMIT_LEASE_SECONDS = 20
export const RETRY_BATCH_LIMIT = 25
export const CONTACT_LOCK_DELAY_MS = 250
export const EVENT_HTTP_TIMEOUT_MS = 8_000
export const RETRY_SECRET_HEADER = 'x-application-status-retry-secret'

export const PROCESSING_STATES = [
  'historic',
  'contact_sync_pending',
  'contact_sync_failed',
  'missing_first_name',
  'obsolete',
  'event_submitting',
  'event_accepted',
  'event_submission_unknown',
] as const

export type ProcessingState = (typeof PROCESSING_STATES)[number]

export const ACQUIRABLE_STATES: readonly ProcessingState[] = [
  'contact_sync_pending',
  'contact_sync_failed',
  'missing_first_name',
]

const TERMINAL_STATES: readonly ProcessingState[] = [
  'historic',
  'obsolete',
  'event_accepted',
  'event_submission_unknown',
]

export type EmailAttempt = {
  id: string
  applicationId: string
  recipientEmail: string
  eventKey: string
  applicationStatus: string
  resendEventName: string
  submissionVersion: number
  processingState: ProcessingState
  claimToken: string | null
  claimedUntil: string | null
  attemptCount: number
  nextAttemptAt: string | null
  deliveryStatus: string
  errorMessage: string | null
  resendEmailId: string | null
  providerEvent: Record<string, string>
}

export type InsertPendingInput = {
  applicationId: string
  recipientEmail: string
  eventKey: string
  applicationStatus: string
  resendEventName: string
  submissionVersion: number
}

export type TransitionInput = {
  id: string
  claimToken: string
  expectedState: ProcessingState
  nextState: ProcessingState
  attemptCount: number
  nextAttemptAt: string | null
  errorMessage: string | null
  deliveryStatus: string
  resendEmailId: string | null
  providerEvent: Record<string, string>
  leaseSeconds: number | null
  clearLease: boolean
}

export type AuditLease = {
  now: () => Date
  insertPending: (
    input: InsertPendingInput
  ) => Promise<{ inserted: boolean; row: EmailAttempt } | { error: true }>
  acquireById: (id: string, leaseSeconds: number) => Promise<EmailAttempt | null>
  acquireNext: (leaseSeconds: number) => Promise<EmailAttempt | null>
  transition: (input: TransitionInput) => Promise<EmailAttempt | null>
  sweepExpired: (limit: number) => Promise<number>
  expireLeases: () => void
}

export function transitionAllowed(
  from: ProcessingState,
  to: ProcessingState
): boolean {
  if (from === 'contact_sync_failed' && to === 'contact_sync_pending') return true
  if (from === 'missing_first_name' && to === 'contact_sync_pending') return true
  if (
    from === 'contact_sync_pending' &&
    (to === 'contact_sync_failed' ||
      to === 'missing_first_name' ||
      to === 'obsolete' ||
      to === 'event_submitting')
  ) {
    return true
  }
  if (
    from === 'event_submitting' &&
    (to === 'event_submitting' ||
      to === 'event_accepted' ||
      to === 'event_submission_unknown')
  ) {
    return true
  }
  return false
}

export function statusMatchesStatusEvent(
  status: string | null,
  eventName: string
): boolean {
  if (
    eventName === 'application_submitted' ||
    eventName === 'application_resubmitted'
  ) {
    return status === 'submitted' || status === 'in_review'
  }
  if (eventName === 'application_needs_info') return status === 'needs_info'
  if (eventName === 'application_approved') return status === 'approved'
  if (eventName === 'application_rejected') return status === 'rejected'
  return false
}

export function isTerminalState(state: ProcessingState): boolean {
  return (TERMINAL_STATES as readonly string[]).includes(state)
}

/** Shared by contact_sync_failed and missing_first_name. Attempt 5 is exhausted. */
export function retryNextAttemptAt(
  nowMs: number,
  attemptCountAfterFailure: number
): string | null {
  if (attemptCountAfterFailure >= MAX_STATUS_EMAIL_ATTEMPTS) return null
  const delaySeconds = Math.min(
    60 * 2 ** (attemptCountAfterFailure - 1),
    6 * 60 * 60
  )
  return new Date(nowMs + delaySeconds * 1000).toISOString()
}

export function isDocumentedEventAcceptance(
  status: number,
  body: unknown
): boolean {
  if (status !== 202 || !body || typeof body !== 'object') return false
  const record = body as { object?: unknown; event?: unknown }
  return record.object === 'event' && typeof record.event === 'string' && record.event.length > 0
}

function leaseStillHeld(row: EmailAttempt, nowMs: number): boolean {
  return row.claimedUntil != null && Date.parse(row.claimedUntil) > nowMs
}

function leaseIsOpen(row: EmailAttempt, nowMs: number): boolean {
  return row.claimedUntil == null || Date.parse(row.claimedUntil) <= nowMs
}

export function isAcquirable(row: EmailAttempt, nowMs: number): boolean {
  if (!(ACQUIRABLE_STATES as readonly string[]).includes(row.processingState)) {
    return false
  }
  if (row.attemptCount >= MAX_STATUS_EMAIL_ATTEMPTS) return false
  if (row.nextAttemptAt == null) return false
  if (Date.parse(row.nextAttemptAt) > nowMs) return false
  return leaseIsOpen(row, nowMs)
}

function newId(): string {
  return crypto.randomUUID()
}

export function createMemoryAuditLease(now: () => Date = () => new Date()): AuditLease {
  const rows: EmailAttempt[] = []

  function sortDue(left: EmailAttempt, right: EmailAttempt): number {
    const leftAt = left.nextAttemptAt == null ? 0 : Date.parse(left.nextAttemptAt)
    const rightAt = right.nextAttemptAt == null ? 0 : Date.parse(right.nextAttemptAt)
    if (leftAt !== rightAt) return leftAt - rightAt
    return left.id < right.id ? -1 : 1
  }

  function takeLease(row: EmailAttempt, leaseSeconds: number): EmailAttempt {
    row.claimToken = newId()
    row.claimedUntil = new Date(
      now().getTime() + leaseSeconds * 1000
    ).toISOString()
    return { ...row, providerEvent: { ...row.providerEvent } }
  }

  const lease: AuditLease & { rows: EmailAttempt[] } = {
    rows,
    now,
    async insertPending(input) {
      const existing = rows.find(
        (row) =>
          row.applicationId === input.applicationId &&
          row.eventKey === input.eventKey
      )
      if (existing) return { inserted: false, row: { ...existing } }
      const row: EmailAttempt = {
        id: newId(),
        applicationId: input.applicationId,
        recipientEmail: input.recipientEmail,
        eventKey: input.eventKey,
        applicationStatus: input.applicationStatus,
        resendEventName: input.resendEventName,
        submissionVersion: input.submissionVersion,
        processingState: 'contact_sync_pending',
        claimToken: null,
        claimedUntil: null,
        attemptCount: 0,
        nextAttemptAt: now().toISOString(),
        deliveryStatus: 'queued',
        errorMessage: null,
        resendEmailId: null,
        providerEvent: { event: input.resendEventName, stage: 'claimed' },
      }
      rows.push(row)
      return { inserted: true, row: { ...row } }
    },
    async acquireById(id, leaseSeconds) {
      const row = rows.find((item) => item.id === id)
      if (!row || !isAcquirable(row, now().getTime())) return null
      return takeLease(row, leaseSeconds)
    },
    async acquireNext(leaseSeconds) {
      const row = rows
        .filter((item) => isAcquirable(item, now().getTime()))
        .sort(sortDue)[0]
      if (!row) return null
      return takeLease(row, leaseSeconds)
    },
    async transition(input) {
      if (!transitionAllowed(input.expectedState, input.nextState)) return null
      const row = rows.find((item) => item.id === input.id)
      if (!row) return null
      if (row.claimToken !== input.claimToken) return null
      if (row.processingState !== input.expectedState) return null
      if (!leaseStillHeld(row, now().getTime())) return null
      row.processingState = input.nextState
      row.attemptCount = input.attemptCount
      row.nextAttemptAt = input.nextAttemptAt
      row.errorMessage = input.errorMessage
      row.deliveryStatus = input.deliveryStatus
      row.resendEmailId = input.resendEmailId
      row.providerEvent = { ...input.providerEvent }
      if (input.clearLease) {
        row.claimToken = null
        row.claimedUntil = null
      } else if (input.leaseSeconds != null) {
        row.claimedUntil = new Date(
          now().getTime() + input.leaseSeconds * 1000
        ).toISOString()
      }
      return { ...row, providerEvent: { ...row.providerEvent } }
    },
    async sweepExpired(limit) {
      const nowMs = now().getTime()
      const picked = rows
        .filter(
          (row) =>
            row.processingState === 'event_submitting' &&
            row.claimedUntil != null &&
            Date.parse(row.claimedUntil) <= nowMs
        )
        .slice(0, limit)
      for (const row of picked) {
        row.processingState = 'event_submission_unknown'
        row.claimToken = null
        row.claimedUntil = null
        row.nextAttemptAt = null
        row.deliveryStatus = 'unconfirmed'
        row.errorMessage = 'event_submission_unknown'
        row.providerEvent = { category: 'event_submission_unknown' }
      }
      return picked.length
    },
    expireLeases() {
      const expired = new Date(0).toISOString()
      for (const row of rows) {
        if (row.claimedUntil != null) row.claimedUntil = expired
      }
    },
  }
  return lease
}

export function seedEmailAttempt(
  lease: AuditLease,
  row: EmailAttempt
): void {
  const memory = lease as AuditLease & { rows?: EmailAttempt[] }
  if (!memory.rows) {
    throw new Error('seed requires the in-memory lease')
  }
  memory.rows.push(row)
}
