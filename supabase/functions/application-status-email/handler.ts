/**
 * Applicant-status Resend event sender (database webhook handler).
 *
 * Runtime secrets are read only via deps.getEnv — never hard-coded:
 * APPLICATION_STATUS_WEBHOOK_SECRET, RESEND_API_KEY, SUPABASE_URL /
 * NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *
 * Idempotency: event_key is `${resendEventName}:${applicationSubmissionVersion}`.
 * Version is incremented in Postgres only on draft|needs_info → submitted.
 * The audit row is claimed before any Resend call. A later webhook with the
 * same event_key is a duplicate and returns before Resend is called. A claim
 * marked contact_sync_failed or missing_first_name therefore does not
 * automatically retry.
 */

export const WEBHOOK_SECRET_HEADER = 'x-application-status-webhook-secret'
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
  claimAudit: (row: AuditClaim) => Promise<ClaimResult>
  updateAudit: (id: string, patch: AuditPatch) => Promise<void>
  log: (message: string) => void
}

type JsonResponse = {
  ok: boolean
  result?:
    | 'sent'
    | 'skipped'
    | 'duplicate'
    | 'missing_first_name'
    | 'contact_sync_failed'
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

async function patchContactFirstName(
  fetchImpl: typeof fetch,
  apiKey: string,
  email: string,
  firstName: string
): Promise<boolean> {
  let response: Response
  try {
    response = await fetchImpl(contactUrl(email), {
      method: 'PATCH',
      headers: resendHeaders(apiKey, true),
      body: JSON.stringify({ first_name: firstName }),
    })
  } catch {
    return false
  }
  await drain(response)
  return response.ok
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
  draft: unknown
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
      explicitName
    )
    return patched
      ? { ok: true }
      : { ok: false, reason: CONTACT_SYNC_FAILED }
  }

  if (!explicitName) return { ok: false, reason: MISSING_FIRST_NAME }

  const created = await createContact(fetchImpl, apiKey, email, explicitName)
  if (created === 'created') return { ok: true }

  // A concurrent create can win between the 404 and this POST.
  // resource_locked (409) is the documented "retry the request" signal.
  // Any other failure is re-read once in case the contact now exists.
  lookup = await lookupContact(fetchImpl, apiKey, email)
  if (lookup.status === 'found') {
    const patched = await patchContactFirstName(
      fetchImpl,
      apiKey,
      email,
      explicitName
    )
    return patched
      ? { ok: true }
      : { ok: false, reason: CONTACT_SYNC_FAILED }
  }
  if (lookup.status === 'error') return { ok: false, reason: CONTACT_SYNC_FAILED }

  if (created === 'locked') {
    const retried = await createContact(fetchImpl, apiKey, email, explicitName)
    if (retried === 'created') return { ok: true }
    lookup = await lookupContact(fetchImpl, apiKey, email)
    if (lookup.status === 'found') {
      const patched = await patchContactFirstName(
        fetchImpl,
        apiKey,
        email,
        explicitName
      )
      return patched
        ? { ok: true }
        : { ok: false, reason: CONTACT_SYNC_FAILED }
    }
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

function httpStatusCategory(status: number): '2xx' | '4xx' | '5xx' | 'other' {
  if (status >= 200 && status < 300) return '2xx'
  if (status >= 400 && status < 500) return '4xx'
  if (status >= 500 && status < 600) return '5xx'
  return 'other'
}

function opaqueProviderId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 128) return null
  if (/https?:\/\//i.test(trimmed)) return null
  if (/\s/.test(trimmed)) return null
  return trimmed
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

  const resendKey = deps.getEnv('RESEND_API_KEY')?.trim() ?? ''
  if (!resendKey) {
    deps.log('skipped_missing_provider')
    return json(200, { ok: false, error: 'failed' })
  }

  const eventKey = eventKeyFor(resendEventName, authoritativeVersion)
  const claim = await deps.claimAudit({
    applicationId: profileId,
    recipientEmail,
    eventKey,
    applicationStatus: mapped.eventName === 'application_submitted'
      ? 'submitted'
      : mapped.eventName === 'application_needs_info'
        ? 'needs_info'
        : mapped.eventName === 'application_approved'
          ? 'approved'
          : 'rejected',
    eventName: resendEventName,
    deliveryStatus: 'queued',
  })

  if (claim.status === 'duplicate') {
    deps.log('duplicate')
    return json(200, { ok: true, result: 'duplicate' })
  }

  if (claim.status === 'error') {
    deps.log('claim_failed')
    return json(200, { ok: false, error: 'failed' })
  }

  const contactSync = await ensureContactFirstName(
    deps.fetch,
    resendKey,
    recipientEmail,
    profile.application_draft
  )
  if (!contactSync.ok) {
    await deps.updateAudit(claim.id, {
      deliveryStatus: 'failed',
      errorText: contactSync.reason,
      providerEmailId: null,
      metadata: {
        event: mapped.eventName,
        category: contactSync.reason,
      },
    })
    deps.log(contactSync.reason)
    return json(200, {
      ok: false,
      error: 'failed',
      result: contactSync.reason,
    })
  }

  // Documented Send Event body is `event` plus exactly one of `email` or
  // `contact_id`. first_name and action_url are not documented body fields.
  // The approval template reads Contact.first_name, and that automation
  // configures its own action URL. Whether the submitted, resubmitted,
  // needs-info, or rejected automations read those removed fields was not
  // established.
  const resendBody = {
    event: resendEventName,
    email: recipientEmail,
  }

  let resendResponse: Response
  try {
    resendResponse = await deps.fetch(RESEND_EVENTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(resendBody),
    })
  } catch {
    await deps.updateAudit(claim.id, {
      deliveryStatus: 'failed',
      errorText: 'network_error',
      providerEmailId: null,
      metadata: { event: mapped.eventName, category: 'network_error' },
    })
    deps.log('network_error')
    return json(200, { ok: false, error: 'failed' })
  }

  const category = httpStatusCategory(resendResponse.status)
  let providerId: string | null = null
  if (resendResponse.ok) {
    try {
      const parsed = (await resendResponse.json()) as { id?: unknown }
      providerId = opaqueProviderId(parsed.id)
    } catch {
      providerId = null
    }
    await deps.updateAudit(claim.id, {
      deliveryStatus: 'sent',
      errorText: null,
      providerEmailId: providerId,
      metadata: {
        event: mapped.eventName,
        http_status_category: category,
      },
    })
    deps.log('sent')
    return json(200, { ok: true, result: 'sent' })
  }

  const errorText =
    category === '4xx' ? 'resend_4xx' : category === '5xx' ? 'resend_5xx' : 'resend_4xx'
  try {
    await resendResponse.body?.cancel()
  } catch {
    /* ignore unread body */
  }
  await deps.updateAudit(claim.id, {
    deliveryStatus: 'failed',
    errorText,
    providerEmailId: null,
    metadata: {
      event: mapped.eventName,
      http_status_category: category,
      category: errorText,
    },
  })
  deps.log(errorText)
  return json(200, { ok: false, error: 'failed' })
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

  return {
    getEnv,
    fetch: fetchImpl,
    log,
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
    async claimAudit(row) {
      const { url, key } = restHeaders()
      if (!url || !key) return { status: 'error' }
      const response = await fetchImpl(`${url}/rest/v1/application_email_log`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          application_id: row.applicationId,
          recipient_user_id: row.applicationId,
          recipient_email: row.recipientEmail,
          event_key: row.eventKey,
          application_status: row.applicationStatus,
          delivery_status: row.deliveryStatus,
          error_message: null,
          provider_event: {
            event: row.eventName,
            stage: 'claimed',
          },
        }),
      })
      if (response.status === 409) {
        try {
          await response.body?.cancel()
        } catch {
          /* ignore */
        }
        return { status: 'duplicate' }
      }
      if (!response.ok) {
        try {
          await response.body?.cancel()
        } catch {
          /* ignore */
        }
        return { status: 'error' }
      }
      const inserted = (await response.json()) as Array<{ id?: unknown }>
      const id = inserted[0]?.id
      if (typeof id !== 'string') return { status: 'error' }
      return { status: 'claimed', id }
    },
    async updateAudit(id, patch) {
      const { url, key } = restHeaders()
      if (!url || !key) return
      const response = await fetchImpl(
        `${url}/rest/v1/application_email_log?id=eq.${id}`,
        {
          method: 'PATCH',
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            delivery_status: patch.deliveryStatus,
            error_message: patch.errorText,
            resend_email_id: patch.providerEmailId,
            provider_event: patch.metadata,
          }),
        }
      )
      try {
        await response.body?.cancel()
      } catch {
        /* ignore */
      }
    },
  }
}
