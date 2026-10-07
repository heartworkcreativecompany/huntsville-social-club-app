/**
 * Applicant-status Resend event sender (database webhook handler).
 *
 * Runtime secrets are read only via deps.getEnv — never hard-coded:
 * APPLICATION_STATUS_WEBHOOK_SECRET, RESEND_API_KEY, SUPABASE_URL /
 * NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *
 * Idempotency: event_key is `${resendEventName}:${applicationSubmissionVersion}`.
 * Version is incremented in Postgres only on draft|needs_info → submitted.
 * The audit row is inserted before any Resend call. Pre-send failures stay
 * on that row and can be retried until attempt 5. Event submission is not
 * retried after it has been attempted. next_attempt_at null is not due work.
 */

import {
  CONTACT_LOCK_DELAY_MS,
  EVENT_HTTP_TIMEOUT_MS,
  PRE_SEND_LEASE_SECONDS,
  RETRY_BATCH_LIMIT,
  RETRY_SECRET_HEADER,
  SUBMIT_LEASE_SECONDS,
  isDocumentedEventAcceptance,
  isTerminalState,
  retryNextAttemptAt,
  statusMatchesStatusEvent,
  type AuditLease,
  type EmailAttempt,
  type InsertPendingInput,
  type TransitionInput,
} from './audit-lease.ts'

export const WEBHOOK_SECRET_HEADER = 'x-application-status-webhook-secret'
export { RETRY_SECRET_HEADER }
export const RESEND_EVENTS_URL = 'https://api.resend.com/events/send'
export const RESEND_CONTACTS_URL = 'https://api.resend.com/contacts'
export const CONTACT_SYNC_FAILED = 'contact_sync_failed'
export const MISSING_FIRST_NAME = 'missing_first_name'

export const ACTION_URLS = {
  application_submitted:
    'https://members.huntsvillesocialclub.com/application/status',
  application_needs_info: 'https://members.huntsvillesocialclub.com/application',
  application_approved: 'https://members.huntsvillesocialclub.com/',
  application_rejected:
    'https://members.huntsvillesocialclub.com/application/status',
} as const

export type ResendEventName = keyof typeof ACTION_URLS

const APPLICATION_STATUSES = [
  'draft',
  'submitted',
  'in_review',
  'needs_info',
  'approved',
  'rejected',
] as const

type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type LoadedProfile = {
  email: string | null
  application_draft: unknown
  application_status: string | null
  application_submission_version: number | null
}

export type AuditClaim = {
  applicationId: string
  recipientEmail: string
  eventKey: string
  applicationStatus: ApplicationStatus
  eventName: ResendEventName | 'application_resubmitted'
  deliveryStatus: 'queued'
}

export type ClaimResult =
  | { status: 'claimed'; id: string }
  | { status: 'duplicate' }
  | { status: 'error' }

export type AuditPatch = {
  deliveryStatus: 'sent' | 'failed'
  errorText: string | null
  providerEmailId: string | null
  metadata: Record<string, string>
}

export type HandlerDeps = {
  getEnv: (name: string) => string | undefined
  fetch: typeof fetch
  loadProfile: (id: string) => Promise<LoadedProfile | null>
  audit: AuditLease
  log: (message: string) => void
  delay?: (ms: number) => Promise<void>
  beforeEventConfirmation?: () => Promise<void>
}

type JsonResponse = {
  ok: boolean
  result?:
    | 'event_accepted'
    | 'event_submission_unknown'
    | 'skipped'
    | 'duplicate'
    | 'not_acquired'
    | 'obsolete'
    | 'missing_first_name'
    | 'contact_sync_failed'
    | 'retry_batch'
  error?: 'unauthorized' | 'method_not_allowed' | 'failed'
}

function json(status: number, body: JsonResponse): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return (
    typeof value === 'string' &&
    (APPLICATION_STATUSES as readonly string[]).includes(value)
  )
}

/** Explicit application first name. Display name and full_name are not names. */
export function explicitFirstNameFromDraft(draft: unknown): string | null {
  if (!draft || typeof draft !== 'object') return null
  const profile = (draft as { profile?: unknown }).profile
  if (!profile || typeof profile !== 'object') return null
  const value = (profile as { firstName?: unknown }).firstName
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function usableStoredFirstName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function contactUrl(email: string): string {
  return `${RESEND_CONTACTS_URL}/${encodeURIComponent(email)}`
}

function resendHeaders(apiKey: string, jsonBody: boolean): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
    ...(jsonBody ? { 'Content-Type': 'application/json' } : {}),
  }
}

async function drain(response: Response): Promise<void> {
  try {
    await response.body?.cancel()
  } catch {
    /* ignore unread body */
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function providerErrorName(response: Response): Promise<string | null> {
  const parsed = await readJson(response)
  if (!parsed || typeof parsed !== 'object') return null
  const name = (parsed as { name?: unknown }).name
  return typeof name === 'string' ? name : null
}

type ContactLookup =
  | { status: 'found'; firstName: string | null }
  | { status: 'missing' }
  | { status: 'error' }

async function lookupContact(
  fetchImpl: typeof fetch,
  apiKey: string,
  email: string
): Promise<ContactLookup> {
  let response: Response
  try {
    response = await fetchImpl(contactUrl(email), {
      method: 'GET',
      headers: resendHeaders(apiKey, false),
    })
  } catch {
    return { status: 'error' }
  }
  if (response.status === 404) {
    await drain(response)
    return { status: 'missing' }
  }
  if (!response.ok) {
    await drain(response)
    return { status: 'error' }
  }
  const parsed = await readJson(response)
  const firstName =
    parsed && typeof parsed === 'object'
      ? usableStoredFirstName((parsed as { first_name?: unknown }).first_name)
      : null
  return { status: 'found', firstName }
}

type PatchResult = 'ok' | 'locked' | 'failed'

async function patchContactOnce(
  fetchImpl: typeof fetch,
  apiKey: string,
  email: string,
  firstName: string
): Promise<PatchResult> {
  let response: Response
  try {
    response = await fetchImpl(contactUrl(email), {
      method: 'PATCH',
      headers: resendHeaders(apiKey, true),
      body: JSON.stringify({ first_name: firstName }),
    })
  } catch {
    return 'failed'
  }
  if (response.ok) {
    await drain(response)
    return 'ok'
  }
  const name = await providerErrorName(response)
  if (response.status === 409 && name === 'resource_locked') return 'locked'
  return 'failed'
}

async function patchContactFirstName(
  fetchImpl: typeof fetch,
  apiKey: string,
  email: string,
  firstName: string,
  delay: (ms: number) => Promise<void>
): Promise<boolean> {
  const first = await patchContactOnce(fetchImpl, apiKey, email, firstName)
  if (first === 'ok') return true
  if (first !== 'locked') return false
  await delay(CONTACT_LOCK_DELAY_MS)
  const lookup = await lookupContact(fetchImpl, apiKey, email)
  if (lookup.status === 'found' && lookup.firstName === firstName) return true
  if (lookup.status !== 'found') return false
  return (await patchContactOnce(fetchImpl, apiKey, email, firstName)) === 'ok'
}

type CreateContactResult = 'created' | 'locked' | 'failed'

/**
 * Create payload is email + first_name only.
 * OpenAPI CreateContactOptions requires email and does not define a default
 * for unsubscribed. Setting unsubscribed true suppresses Broadcasts and
 * Automation emails, which would block this status message. Broadcasts are
 * sent to a Segment; omitting segments and topics does not enroll the
 * contact. unsubscribed is omitted because neither true nor false is a
 * documented "not subscribed" default that still allows the automation.
 */
async function createContact(
  fetchImpl: typeof fetch,
  apiKey: string,
  email: string,
  firstName: string
): Promise<CreateContactResult> {
  let response: Response
  try {
    response = await fetchImpl(RESEND_CONTACTS_URL, {
      method: 'POST',
      headers: resendHeaders(apiKey, true),
      body: JSON.stringify({
        email,
        first_name: firstName,
      }),
    })
  } catch {
    return 'failed'
  }
  if (response.ok) {
    await drain(response)
    return 'created'
  }
  const name = await providerErrorName(response)
  if (response.status === 409 && name === 'resource_locked') return 'locked'
  return 'failed'
}

type ContactSyncResult =
  | { ok: true }
  | { ok: false; reason: typeof CONTACT_SYNC_FAILED | typeof MISSING_FIRST_NAME }

async function ensureContactFirstName(
  fetchImpl: typeof fetch,
  apiKey: string,
  email: string,
  draft: unknown,
  delay: (ms: number) => Promise<void>
): Promise<ContactSyncResult> {
  const explicitName = explicitFirstNameFromDraft(draft)
  let lookup = await lookupContact(fetchImpl, apiKey, email)
  if (lookup.status === 'error') return { ok: false, reason: CONTACT_SYNC_FAILED }

  if (lookup.status === 'found') {
    if (!explicitName) {
      return lookup.firstName
        ? { ok: true }
        : { ok: false, reason: MISSING_FIRST_NAME }
    }
    const patched = await patchContactFirstName(
      fetchImpl,
      apiKey,
      email,
      explicitName,
      delay
    )
    return patched
      ? { ok: true }
      : { ok: false, reason: CONTACT_SYNC_FAILED }
  }

  if (!explicitName) return { ok: false, reason: MISSING_FIRST_NAME }

  const created = await createContact(fetchImpl, apiKey, email, explicitName)
  if (created === 'created') return { ok: true }

  // resource_locked is the documented retry-after-delay signal for contact writes.
  // One delayed re-read, then at most one more create or first_name patch.
  if (created === 'locked') await delay(CONTACT_LOCK_DELAY_MS)
  lookup = await lookupContact(fetchImpl, apiKey, email)
  if (lookup.status === 'found') {
    if (lookup.firstName === explicitName) return { ok: true }
    const patched = await patchContactFirstName(
      fetchImpl,
      apiKey,
      email,
      explicitName,
      delay
    )
    return patched
      ? { ok: true }
      : { ok: false, reason: CONTACT_SYNC_FAILED }
  }
  if (lookup.status === 'error') return { ok: false, reason: CONTACT_SYNC_FAILED }
  if (created !== 'locked') return { ok: false, reason: CONTACT_SYNC_FAILED }

  const retried = await createContact(fetchImpl, apiKey, email, explicitName)
  if (retried === 'created') return { ok: true }
  lookup = await lookupContact(fetchImpl, apiKey, email)
  if (lookup.status === 'found') {
    if (lookup.firstName === explicitName) return { ok: true }
    const patched = await patchContactFirstName(
      fetchImpl,
      apiKey,
      email,
      explicitName,
      delay
    )
    return patched
      ? { ok: true }
      : { ok: false, reason: CONTACT_SYNC_FAILED }
  }

  return { ok: false, reason: CONTACT_SYNC_FAILED }
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

function encodeUtf8(value: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(value)
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  )
}

/** Constant-time compare of webhook secrets (SHA-256 digest, then XOR). */
export async function secretsMatch(
  received: string,
  expected: string
): Promise<boolean> {
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encodeUtf8(received)),
    crypto.subtle.digest('SHA-256', encodeUtf8(expected)),
  ])
  const a = new Uint8Array(left)
  const b = new Uint8Array(right)
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/**
 * EVENT_KEY: `${eventName}:${version}` so each valid resubmission can send once.
 * Version is server-produced on draft|needs_info → submitted only.
 */
export function eventKeyFor(
  eventName: ResendEventName | 'application_resubmitted',
  version: number
): string {
  return `${eventName}:${version}`
}

export function parsePositiveSubmissionVersion(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 1 || value > 1_000_000_000) {
      return null
    }
    return value
  }
  if (typeof value === 'string' && /^[1-9]\d{0,8}$/.test(value)) {
    return Number(value)
  }
  return null
}

export function mapStatusTransition(
  previous: unknown,
  next: unknown
): { eventName: ResendEventName; actionUrl: string } | null {
  if (!isApplicationStatus(previous) || !isApplicationStatus(next)) {
    return null
  }
  if (previous === next) return null
  if (next === 'in_review' || next === 'draft') return null

  if (next === 'submitted') {
    if (previous !== 'draft' && previous !== 'needs_info') return null
    return {
      eventName: 'application_submitted',
      actionUrl: ACTION_URLS.application_submitted,
    }
  }

  if (next === 'needs_info') {
    return {
      eventName: 'application_needs_info',
      actionUrl: ACTION_URLS.application_needs_info,
    }
  }

  if (next === 'approved') {
    return {
      eventName: 'application_approved',
      actionUrl: ACTION_URLS.application_approved,
    }
  }

  if (next === 'rejected') {
    return {
      eventName: 'application_rejected',
      actionUrl: ACTION_URLS.application_rejected,
    }
  }

  return null
}

function delayFor(deps: HandlerDeps): (ms: number) => Promise<void> {
  return (
    deps.delay ??
    ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
  )
}

function profileMatchesAttempt(
  profile: LoadedProfile,
  attempt: Pick<EmailAttempt, 'submissionVersion' | 'resendEventName'>
): boolean {
  const version = parsePositiveSubmissionVersion(
    profile.application_submission_version
  )
  return (
    version != null &&
    version === attempt.submissionVersion &&
    statusMatchesStatusEvent(profile.application_status, attempt.resendEventName)
  )
}

async function ensurePending(
  deps: HandlerDeps,
  row: EmailAttempt
): Promise<EmailAttempt | null> {
  if (row.processingState === 'contact_sync_pending') return row
  if (
    row.processingState !== 'contact_sync_failed' &&
    row.processingState !== 'missing_first_name'
  ) {
    return null
  }
  if (!row.claimToken) return null
  return deps.audit.transition({
    id: row.id,
    claimToken: row.claimToken,
    expectedState: row.processingState,
    nextState: 'contact_sync_pending',
    attemptCount: row.attemptCount,
    nextAttemptAt: deps.audit.now().toISOString(),
    errorMessage: null,
    deliveryStatus: 'queued',
    resendEmailId: null,
    providerEvent: { event: row.resendEventName, stage: 'pending' },
    leaseSeconds: PRE_SEND_LEASE_SECONDS,
    clearLease: false,
  })
}

async function markObsolete(
  deps: HandlerDeps,
  row: EmailAttempt
): Promise<void> {
  if (!row.claimToken) return
  await deps.audit.transition({
    id: row.id,
    claimToken: row.claimToken,
    expectedState: 'contact_sync_pending',
    nextState: 'obsolete',
    attemptCount: row.attemptCount,
    nextAttemptAt: null,
    errorMessage: 'obsolete',
    deliveryStatus: 'skipped',
    resendEmailId: null,
    providerEvent: { event: row.resendEventName, category: 'obsolete' },
    leaseSeconds: null,
    clearLease: true,
  })
}

async function schedulePreSendFailure(
  deps: HandlerDeps,
  row: EmailAttempt,
  reason: typeof CONTACT_SYNC_FAILED | typeof MISSING_FIRST_NAME
): Promise<void> {
  if (!row.claimToken) return
  const attemptCount = row.attemptCount + 1
  const nextAttemptAt = retryNextAttemptAt(deps.audit.now().getTime(), attemptCount)
  await deps.audit.transition({
    id: row.id,
    claimToken: row.claimToken,
    expectedState: 'contact_sync_pending',
    nextState: reason,
    attemptCount,
    nextAttemptAt,
    errorMessage: reason,
    deliveryStatus: 'queued',
    resendEmailId: null,
    providerEvent: { category: reason },
    leaseSeconds: null,
    clearLease: true,
  })
}

async function recordEventOutcome(
  deps: HandlerDeps,
  row: EmailAttempt,
  nextState: 'event_accepted' | 'event_submission_unknown'
): Promise<EmailAttempt | null> {
  if (!row.claimToken) return null
  const columnPatch = {
    resend_email_id: null,
    error_message: nextState === 'event_accepted' ? null : 'event_submission_unknown',
    provider_event: { category: nextState },
  }
  return deps.audit.transition({
    id: row.id,
    claimToken: row.claimToken,
    expectedState: 'event_submitting',
    nextState,
    attemptCount: row.attemptCount,
    nextAttemptAt: null,
    errorMessage: columnPatch.error_message,
    deliveryStatus: 'unconfirmed',
    resendEmailId: columnPatch.resend_email_id,
    providerEvent: columnPatch.provider_event,
    leaseSeconds: null,
    clearLease: true,
  })
}

async function processOwnedAttempt(
  deps: HandlerDeps,
  owned: EmailAttempt
): Promise<JsonResponse> {
  const pending = await ensurePending(deps, owned)
  if (!pending?.claimToken) {
    return { ok: true, result: 'not_acquired' }
  }

  const beforeSync = await deps.loadProfile(pending.applicationId)
  if (!beforeSync || !profileMatchesAttempt(beforeSync, pending)) {
    await markObsolete(deps, pending)
    deps.log('obsolete')
    return { ok: true, result: 'obsolete' }
  }

  const resendKey = deps.getEnv('RESEND_API_KEY')?.trim() ?? ''
  if (!resendKey) {
    await schedulePreSendFailure(deps, pending, CONTACT_SYNC_FAILED)
    deps.log(CONTACT_SYNC_FAILED)
    return { ok: false, error: 'failed', result: CONTACT_SYNC_FAILED }
  }

  const contactSync = await ensureContactFirstName(
    deps.fetch,
    resendKey,
    pending.recipientEmail,
    beforeSync.application_draft,
    delayFor(deps)
  )
  if (!contactSync.ok) {
    await schedulePreSendFailure(deps, pending, contactSync.reason)
    deps.log(contactSync.reason)
    return { ok: false, error: 'failed', result: contactSync.reason }
  }

  const beforeSend = await deps.loadProfile(pending.applicationId)
  if (!beforeSend || !profileMatchesAttempt(beforeSend, pending)) {
    await markObsolete(deps, pending)
    deps.log('obsolete')
    return { ok: true, result: 'obsolete' }
  }

  const submitting = await deps.audit.transition({
    id: pending.id,
    claimToken: pending.claimToken,
    expectedState: 'contact_sync_pending',
    nextState: 'event_submitting',
    attemptCount: pending.attemptCount,
    nextAttemptAt: null,
    errorMessage: null,
    deliveryStatus: 'queued',
    resendEmailId: null,
    providerEvent: { event: pending.resendEventName, category: 'event_submitting' },
    leaseSeconds: SUBMIT_LEASE_SECONDS,
    clearLease: false,
  })
  if (!submitting?.claimToken) {
    return { ok: true, result: 'not_acquired' }
  }

  if (deps.beforeEventConfirmation) await deps.beforeEventConfirmation()

  const confirmed = await deps.audit.transition({
    id: submitting.id,
    claimToken: submitting.claimToken,
    expectedState: 'event_submitting',
    nextState: 'event_submitting',
    attemptCount: submitting.attemptCount,
    nextAttemptAt: null,
    errorMessage: null,
    deliveryStatus: 'queued',
    resendEmailId: null,
    providerEvent: { event: submitting.resendEventName, category: 'event_submitting' },
    leaseSeconds: SUBMIT_LEASE_SECONDS,
    clearLease: false,
  })
  if (!confirmed?.claimToken) {
    deps.log('event_submission_unknown')
    return { ok: false, error: 'failed', result: 'event_submission_unknown' }
  }

  // Documented Send Event success is 202 { object: "event", event }.
  // The general error catalog is not an acceptance guarantee for this endpoint.
  // Any other outcome stays event_submission_unknown and is not resubmitted.
  let resendResponse: Response
  try {
    resendResponse = await deps.fetch(RESEND_EVENTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event: confirmed.resendEventName,
        email: confirmed.recipientEmail,
      }),
      signal: AbortSignal.timeout(EVENT_HTTP_TIMEOUT_MS),
    })
  } catch {
    await recordEventOutcome(deps, confirmed, 'event_submission_unknown')
    deps.log('event_submission_unknown')
    return { ok: false, error: 'failed', result: 'event_submission_unknown' }
  }

  let body: unknown = null
  try {
    body = await resendResponse.json()
  } catch {
    body = null
  }
  if (isDocumentedEventAcceptance(resendResponse.status, body)) {
    const recorded = await recordEventOutcome(deps, confirmed, 'event_accepted')
    if (!recorded) {
      deps.log('event_submission_unknown')
      return { ok: false, error: 'failed', result: 'event_submission_unknown' }
    }
    deps.log('event_accepted')
    return { ok: true, result: 'event_accepted' }
  }

  await recordEventOutcome(deps, confirmed, 'event_submission_unknown')
  deps.log('event_submission_unknown')
  return { ok: false, error: 'failed', result: 'event_submission_unknown' }
}

async function runRetryBatch(deps: HandlerDeps): Promise<Response> {
  await deps.audit.sweepExpired(RETRY_BATCH_LIMIT)
  for (let index = 0; index < RETRY_BATCH_LIMIT; index += 1) {
    const row = await deps.audit.acquireNext(PRE_SEND_LEASE_SECONDS)
    if (!row) break
    await processOwnedAttempt(deps, row)
  }
  return json(200, { ok: true, result: 'retry_batch' })
}

type WebhookBody = {
  type?: unknown
  schema?: unknown
  table?: unknown
  record?: Record<string, unknown> | null
  old_record?: Record<string, unknown> | null
}

export async function handleApplicationStatusEmailRequest(
  request: Request,
  deps: HandlerDeps
): Promise<Response> {
  if (request.method !== 'POST') {
    return json(405, { ok: false, error: 'method_not_allowed' })
  }

  const retryHeader = request.headers.get(RETRY_SECRET_HEADER)?.trim() ?? ''
  if (retryHeader) {
    const retrySecret = deps.getEnv('APPLICATION_STATUS_RETRY_SECRET')?.trim() ?? ''
    if (!retrySecret || !(await secretsMatch(retryHeader, retrySecret))) {
      deps.log('unauthorized')
      return json(401, { ok: false, error: 'unauthorized' })
    }
    return runRetryBatch(deps)
  }

  const expected = deps.getEnv('APPLICATION_STATUS_WEBHOOK_SECRET')?.trim() ?? ''
  const received =
    request.headers.get(WEBHOOK_SECRET_HEADER)?.trim() ?? ''

  if (!expected || !received || !(await secretsMatch(received, expected))) {
    deps.log('unauthorized')
    return json(401, { ok: false, error: 'unauthorized' })
  }

  let payload: WebhookBody
  try {
    payload = (await request.json()) as WebhookBody
  } catch {
    deps.log('skipped_invalid_json')
    return json(200, { ok: true, result: 'skipped' })
  }

  if (
    payload.type !== 'UPDATE' ||
    payload.schema !== 'public' ||
    payload.table !== 'profiles'
  ) {
    deps.log('skipped_event_shape')
    return json(200, { ok: true, result: 'skipped' })
  }

  const record = payload.record
  const oldRecord = payload.old_record
  if (!record || typeof record !== 'object') {
    deps.log('skipped_event_shape')
    return json(200, { ok: true, result: 'skipped' })
  }

  const profileId = record.id
  if (!isUuid(profileId)) {
    deps.log('skipped_event_shape')
    return json(200, { ok: true, result: 'skipped' })
  }

  const mapped = mapStatusTransition(
    oldRecord && typeof oldRecord === 'object'
      ? oldRecord.application_status
      : undefined,
    record.application_status
  )
  if (!mapped) {
    deps.log('skipped_transition')
    return json(200, { ok: true, result: 'skipped' })
  }

  const recordVersion = parsePositiveSubmissionVersion(
    record.application_submission_version
  )
  if (recordVersion == null) {
    deps.log('skipped_invalid_version')
    return json(200, { ok: true, result: 'skipped' })
  }

  const profile = await deps.loadProfile(profileId)
  if (!profile) {
    deps.log('profile_not_found')
    return json(200, { ok: false, error: 'failed' })
  }

  if (
    isApplicationStatus(profile.application_status) &&
    profile.application_status !== record.application_status
  ) {
    deps.log('skipped_stale_status')
    return json(200, { ok: true, result: 'skipped' })
  }

  const authoritativeVersion = parsePositiveSubmissionVersion(
    profile.application_submission_version
  )
  if (authoritativeVersion == null || authoritativeVersion !== recordVersion) {
    deps.log('skipped_invalid_version')
    return json(200, { ok: true, result: 'skipped' })
  }

  const resendEventName =
    mapped.eventName === 'application_submitted' && authoritativeVersion > 1
      ? 'application_resubmitted'
      : mapped.eventName

  const recipientEmail = profile.email?.trim() ?? ''
  if (!recipientEmail || !recipientEmail.includes('@')) {
    deps.log('invalid_recipient')
    return json(200, { ok: false, error: 'failed' })
  }

  if (!statusMatchesStatusEvent(profile.application_status, resendEventName)) {
    deps.log('obsolete')
    return json(200, { ok: true, result: 'obsolete' })
  }

  const eventKey = eventKeyFor(resendEventName, authoritativeVersion)
  const applicationStatus =
    resendEventName === 'application_needs_info'
      ? 'needs_info'
      : resendEventName === 'application_approved'
        ? 'approved'
        : resendEventName === 'application_rejected'
          ? 'rejected'
          : 'submitted'
  const inserted = await deps.audit.insertPending({
    applicationId: profileId,
    recipientEmail,
    eventKey,
    applicationStatus,
    resendEventName,
    submissionVersion: authoritativeVersion,
  })
  if ('error' in inserted) {
    deps.log('claim_failed')
    return json(200, { ok: false, error: 'failed' })
  }
  if (
    !inserted.inserted &&
    (isTerminalState(inserted.row.processingState) ||
      inserted.row.processingState === 'event_submitting')
  ) {
    deps.log('duplicate')
    return json(200, { ok: true, result: 'duplicate' })
  }

  const owned = await deps.audit.acquireById(
    inserted.row.id,
    PRE_SEND_LEASE_SECONDS
  )
  if (!owned) {
    deps.log('not_acquired')
    return json(200, { ok: true, result: 'not_acquired' })
  }

  return json(200, await processOwnedAttempt(deps, owned))
}

function attemptFromRpc(value: unknown): EmailAttempt | null {
  if (!value || typeof value !== 'object') return null
  const row = (value as { row?: unknown }).row
  if (!row || typeof row !== 'object') return null
  const data = row as Record<string, unknown>
  if (typeof data.id !== 'string') return null
  const provider = data.provider_event
  const providerEvent: Record<string, string> = {}
  if (provider && typeof provider === 'object') {
    for (const [key, item] of Object.entries(provider)) {
      if (typeof item === 'string') providerEvent[key] = item
    }
  }
  return {
    id: data.id,
    applicationId: String(data.application_id ?? ''),
    recipientEmail: String(data.recipient_email ?? ''),
    eventKey: String(data.event_key ?? ''),
    applicationStatus: String(data.application_status ?? ''),
    resendEventName: String(data.resend_event_name ?? ''),
    submissionVersion: Number(data.submission_version ?? 0),
    processingState: data.processing_state as EmailAttempt['processingState'],
    claimToken: typeof data.claim_token === 'string' ? data.claim_token : null,
    claimedUntil:
      data.claimed_until == null ? null : String(data.claimed_until),
    attemptCount: Number(data.attempt_count ?? 0),
    nextAttemptAt:
      data.next_attempt_at == null ? null : String(data.next_attempt_at),
    deliveryStatus: String(data.delivery_status ?? ''),
    errorMessage:
      typeof data.error_message === 'string' ? data.error_message : null,
    resendEmailId:
      typeof data.resend_email_id === 'string' ? data.resend_email_id : null,
    providerEvent,
  }
}

export function createProductionDeps(
  getEnv: HandlerDeps['getEnv'],
  fetchImpl: typeof fetch,
  log: HandlerDeps['log'] = (message) => {
    console.info(`[application-status-email] ${message}`)
  }
): HandlerDeps {
  const restHeaders = () => {
    const key = getEnv('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? ''
    const url = (
      getEnv('SUPABASE_URL') ?? getEnv('NEXT_PUBLIC_SUPABASE_URL') ?? ''
    ).replace(/\/$/, '')
    return { url, key }
  }

  async function rpc(name: string, body: Record<string, unknown>): Promise<unknown> {
    const { url, key } = restHeaders()
    if (!url || !key) return null
    const response = await fetchImpl(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      try {
        await response.body?.cancel()
      } catch {
        /* ignore unread body */
      }
      return null
    }
    return response.json()
  }

  const audit: AuditLease = {
    now: () => new Date(),
    async insertPending(input: InsertPendingInput) {
      const parsed = await rpc('insert_application_email_pending', {
        p_application_id: input.applicationId,
        p_recipient_email: input.recipientEmail,
        p_event_key: input.eventKey,
        p_application_status: input.applicationStatus,
        p_resend_event_name: input.resendEventName,
        p_submission_version: input.submissionVersion,
      })
      const row = attemptFromRpc(parsed)
      if (!row || !parsed || typeof parsed !== 'object') return { error: true }
      return {
        inserted: (parsed as { inserted?: unknown }).inserted === true,
        row,
      }
    },
    async acquireById(id, leaseSeconds) {
      return attemptFromRpc(
        await rpc('acquire_application_email_lease', {
          p_id: id,
          p_lease_seconds: leaseSeconds,
        })
      )
    },
    async acquireNext(leaseSeconds) {
      return attemptFromRpc(
        await rpc('acquire_next_application_email_lease', {
          p_lease_seconds: leaseSeconds,
        })
      )
    },
    async transition(input: TransitionInput) {
      const columnPatch = {
        resend_email_id: input.resendEmailId,
        error_message: input.errorMessage,
        provider_event: input.providerEvent,
      }
      return attemptFromRpc(
        await rpc('transition_application_email_attempt', {
          p_id: input.id,
          p_claim_token: input.claimToken,
          p_expected_state: input.expectedState,
          p_next_state: input.nextState,
          p_attempt_count: input.attemptCount,
          p_next_attempt_at: input.nextAttemptAt,
          p_error_message: columnPatch.error_message,
          p_delivery_status: input.deliveryStatus,
          p_resend_email_id: columnPatch.resend_email_id,
          p_provider_event: columnPatch.provider_event,
          p_lease_seconds: input.leaseSeconds,
          p_clear_lease: input.clearLease,
        })
      )
    },
    async sweepExpired(limit) {
      const parsed = await rpc('sweep_expired_event_submissions', {
        p_limit: limit,
      })
      return typeof parsed === 'number' ? parsed : 0
    },
    expireLeases() {
      /* production leases expire in Postgres */
    },
  }

  return {
    getEnv,
    fetch: fetchImpl,
    log,
    audit,
    async loadProfile(id) {
      const { url, key } = restHeaders()
      if (!url || !key) return null
      const response = await fetchImpl(
        `${url}/rest/v1/profiles?id=eq.${id}&select=email,application_draft,application_status,application_submission_version`,
        {
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            Accept: 'application/json',
          },
        }
      )
      if (!response.ok) return null
      const rows = (await response.json()) as LoadedProfile[]
      return rows[0] ?? null
    },
  }
}
