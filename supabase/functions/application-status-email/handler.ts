/**
 * Applicant-status Resend event sender (database webhook handler).
 *
 * Runtime secrets are read only via deps.getEnv — never hard-coded:
 * APPLICATION_STATUS_WEBHOOK_SECRET, RESEND_API_KEY, SUPABASE_URL /
 * NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *
 * Idempotency: event_key is `${resendEventName}:${applicationSubmissionVersion}`.
 * Version is incremented in Postgres only on draft|needs_info → submitted.
 */

export const WEBHOOK_SECRET_HEADER = 'x-application-status-webhook-secret'
export const RESEND_EVENTS_URL = 'https://api.resend.com/events/send'

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
  full_name: string | null
  application_status: string | null
  application_submission_version: number | null
}

export type AuditClaim = {
  applicationId: string
  recipientEmail: string
  eventKey: string
  applicationStatus: ApplicationStatus
  eventName: ResendEventName
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
  result?: 'sent' | 'skipped' | 'duplicate'
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

function firstNameFromFullName(fullName: string | null | undefined): string {
  const token = fullName?.trim().split(/\s+/)[0]
  return token ?? ''
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
  eventName: ResendEventName,
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

  const eventKey = eventKeyFor(mapped.eventName, authoritativeVersion)
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
    eventName: mapped.eventName,
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

  const resendBody = {
    event: mapped.eventName,
    email: recipientEmail,
    first_name: firstNameFromFullName(profile.full_name),
    action_url: mapped.actionUrl,
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
        `${url}/rest/v1/profiles?id=eq.${id}&select=email,full_name,application_status,application_submission_version`,
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
          error_text: null,
          provider_metadata: {
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
            error_text: patch.errorText,
            provider_email_id: patch.providerEmailId,
            provider_metadata: patch.metadata,
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
