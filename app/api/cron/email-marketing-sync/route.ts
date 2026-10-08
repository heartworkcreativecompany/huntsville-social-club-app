import { NextResponse } from 'next/server'
import {
  EMAIL_MARKETING_SYNC_LEASE_MS,
  nextMarketingSyncDelaySeconds,
  runEmailMarketingSyncAttempt,
  type EmailMarketingSyncDecision,
  type LocalMarketingConsent,
} from '@/lib/email-marketing-sync'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const RESEND_CONTACTS_URL = 'https://api.resend.com/contacts'
const COMPLETION_RESERVE_MS = 1000
const MAX_JOBS_PER_INVOCATION = 20

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  return request.headers.get('authorization') === `Bearer ${cronSecret}`
}

type SyncJob = {
  id: string
  profile_id: string
  action: 'enroll' | 'withdraw'
  attempt_count: number
  lease_owner: string
  lease_expires_at: string
}

type RecheckRow = {
  decision: string
  recipient_email: string | null
}

type FinishStatus = 'pending' | 'synced' | 'skipped' | 'failed'

/**
 * Abort provider work before the database lease expires so a reclaimed
 * owner is the only worker still allowed to call Resend. The reserve leaves
 * time for the token-checked completion update.
 */
function providerSignal(leaseExpiresAt: string): AbortSignal {
  const remaining = Date.parse(leaseExpiresAt) - Date.now() - COMPLETION_RESERVE_MS
  if (!Number.isFinite(remaining) || remaining <= 0) {
    return AbortSignal.abort()
  }
  if (remaining > EMAIL_MARKETING_SYNC_LEASE_MS) {
    return AbortSignal.timeout(EMAIL_MARKETING_SYNC_LEASE_MS - COMPLETION_RESERVE_MS)
  }
  return AbortSignal.timeout(remaining)
}

async function readBoundedBody(response: Response, signal: AbortSignal): Promise<string> {
  const body = response.body
  if (signal.aborted) {
    await body?.cancel()
    throw new Error('provider_timeout')
  }
  if (!body) return ''

  let removeAbort = () => {}
  const aborted = new Promise<never>((_, reject) => {
    const onAbort = () => {
      void body.cancel()
      reject(new Error('provider_timeout'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    removeAbort = () => signal.removeEventListener('abort', onAbort)
  })

  try {
    return await Promise.race([response.text(), aborted])
  } finally {
    removeAbort()
  }
}

async function providerRequest(input: {
  url: string
  method: 'GET' | 'POST' | 'PATCH'
  apiKey: string
  body?: { unsubscribed: boolean } | { email: string; unsubscribed: boolean }
  signal: AbortSignal
}): Promise<{ status: number; json: { unsubscribed?: unknown } | null }> {
  if (input.signal.aborted) {
    throw new Error('provider_timeout')
  }
  const response = await fetch(input.url, {
    method: input.method,
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      ...(input.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
    signal: input.signal,
  })
  const text = await readBoundedBody(response, input.signal)
  if (!text) return { status: response.status, json: null }
  try {
    return {
      status: response.status,
      json: JSON.parse(text) as { unsubscribed?: unknown },
    }
  } catch {
    return { status: response.status, json: null }
  }
}

async function lookupProvider(
  email: string,
  apiKey: string,
  signal: AbortSignal
): Promise<'missing' | 'subscribed' | 'unsubscribed'> {
  const result = await providerRequest({
    url: `${RESEND_CONTACTS_URL}/${encodeURIComponent(email)}`,
    method: 'GET',
    apiKey,
    signal,
  })
  if (result.status === 404) return 'missing'
  if (result.status < 200 || result.status >= 300) {
    throw new Error('provider_lookup_failed')
  }
  return result.json?.unsubscribed === true ? 'unsubscribed' : 'subscribed'
}

async function sendSubscription(input: {
  email: string
  body: { unsubscribed: boolean }
  method: 'POST' | 'PATCH'
  apiKey: string
  signal: AbortSignal
}) {
  const url =
    input.method === 'POST'
      ? RESEND_CONTACTS_URL
      : `${RESEND_CONTACTS_URL}/${encodeURIComponent(input.email)}`
  const payload =
    input.method === 'POST'
      ? { email: input.email, unsubscribed: input.body.unsubscribed }
      : { unsubscribed: input.body.unsubscribed }
  const result = await providerRequest({
    url,
    method: input.method,
    apiKey: input.apiKey,
    body: payload,
    signal: input.signal,
  })
  if (result.status < 200 || result.status >= 300) {
    throw new Error('provider_write_failed')
  }
}

function localFromDecision(row: RecheckRow | undefined, action: SyncJob['action']): LocalMarketingConsent {
  if (!row || row.decision === 'skip_no_email' || row.decision === 'missing_job') {
    return { email: null, emailConfirmed: false, optIn: false, optedOutAt: null }
  }
  if (row.decision === 'defer_unconfirmed') {
    return {
      email: row.recipient_email,
      emailConfirmed: false,
      optIn: true,
      optedOutAt: null,
    }
  }
  if (row.decision === 'skip_withdrawn') {
    return {
      email: row.recipient_email,
      emailConfirmed: true,
      optIn: true,
      optedOutAt: new Date(0).toISOString(),
    }
  }
  if (row.decision === 'skip_not_opted_in') {
    return {
      email: row.recipient_email,
      emailConfirmed: true,
      optIn: false,
      optedOutAt: null,
    }
  }
  return {
    email: row.recipient_email,
    emailConfirmed: true,
    optIn: action === 'enroll',
    optedOutAt: null,
  }
}

function completionFor(
  decision: EmailMarketingSyncDecision,
  attemptCount: number
): { status: FinishStatus; lastError: string | null; delaySeconds: number | null } {
  if (decision === 'defer_unconfirmed') {
    const delaySeconds = nextMarketingSyncDelaySeconds(attemptCount)
    return {
      status: delaySeconds === null ? 'failed' : 'pending',
      lastError: 'unconfirmed',
      delaySeconds,
    }
  }

  const skipped =
    decision === 'skip_withdrawn' ||
    decision === 'skip_not_opted_in' ||
    decision === 'skip_no_email' ||
    decision === 'record_provider_unsubscribe' ||
    decision === 'missing_job'

  if (skipped) {
    return { status: 'skipped', lastError: decision, delaySeconds: null }
  }

  return { status: 'synced', lastError: null, delaySeconds: null }
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY is required.' },
      { status: 500 }
    )
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY is required.' }, { status: 500 })
  }

  let claimed = 0
  let synced = 0
  let skipped = 0
  let deferred = 0
  let failed = 0
  let stale = 0

  for (let index = 0; index < MAX_JOBS_PER_INVOCATION; index += 1) {
    const { data: claimedRows, error: claimError } = await admin.rpc(
      'claim_email_marketing_sync_jobs',
      { limit_count: 1 }
    )
    if (claimError) {
      return NextResponse.json({ error: 'Could not claim sync jobs.' }, { status: 500 })
    }

    const job = ((claimedRows ?? []) as SyncJob[])[0]
    if (!job) break
    claimed += 1

    const finish = async (input: {
      status: FinishStatus
      lastError: string | null
      delaySeconds: number | null
    }) => {
      const { data, error } = await admin.rpc('finish_email_marketing_sync_job', {
        target_job_id: job.id,
        owner_token: job.lease_owner,
        next_status: input.status,
        error_code: input.lastError,
        retry_at:
          input.delaySeconds === null
            ? null
            : new Date(Date.now() + input.delaySeconds * 1000).toISOString(),
      })
      if (error) return false
      return data === true
    }

    try {
      const signal = providerSignal(job.lease_expires_at)
      const decision = await runEmailMarketingSyncAttempt({
        action: job.action,
        readLocal: async () => {
          const { data, error } = await admin.rpc('recheck_email_marketing_sync', {
            target_job_id: job.id,
          })
          if (error) throw new Error('recheck_failed')
          const row = (Array.isArray(data) ? data[0] : data) as RecheckRow | undefined
          return localFromDecision(row, job.action)
        },
        lookupProvider: (email) => lookupProvider(email, apiKey, signal),
        send: (sendInput) => sendSubscription({ ...sendInput, apiKey, signal }),
        recordProviderUnsubscribe: async (email) => {
          const { error } = await admin.rpc('apply_resend_contact_unsubscribe', {
            target_email: email,
            provider_event_id: `provider-unsubscribed:${job.id}`,
          })
          if (error) throw new Error('provider_unsubscribe_record_failed')
        },
      })

      const outcome = completionFor(decision, job.attempt_count)
      const finished = await finish(outcome)
      if (!finished) {
        stale += 1
        continue
      }
      if (outcome.status === 'pending') deferred += 1
      else if (outcome.status === 'failed') failed += 1
      else if (outcome.status === 'skipped') skipped += 1
      else synced += 1
    } catch {
      const delaySeconds = nextMarketingSyncDelaySeconds(job.attempt_count)
      const finished = await finish({
        status: delaySeconds === null ? 'failed' : 'pending',
        lastError: 'provider_error',
        delaySeconds,
      })
      if (!finished) stale += 1
      else failed += 1
    }
  }

  return NextResponse.json({
    ok: true,
    claimed,
    synced,
    skipped,
    deferred,
    failed,
    stale,
  })
}
