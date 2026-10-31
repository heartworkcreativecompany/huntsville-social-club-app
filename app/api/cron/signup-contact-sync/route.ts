import { NextResponse } from 'next/server'
import {
  EMAIL_MARKETING_SYNC_LEASE_MS,
  contactWritePayload,
  ensureContactCompletion,
  ensureContactProviderFailure,
  runEnsureContactAttempt,
  type EnsureContactCreateBody,
  type MarketingNameWriteBody,
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
  action: 'ensure_contact'
  attempt_count: number
  lease_owner: string
  lease_expires_at: string
}

type RecheckRow = {
  decision: string
  recipient_email: string | null
  given_name: string | null
  family_name: string | null
}

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

async function providerRequest(input: {
  url: string
  method: 'GET' | 'POST' | 'PATCH'
  apiKey: string
  body?: ReturnType<typeof contactWritePayload> | MarketingNameWriteBody
  signal: AbortSignal
}): Promise<{ status: number; unsubscribed: boolean | null }> {
  if (input.signal.aborted) throw new Error('provider_timeout')
  const response = await fetch(input.url, {
    method: input.method,
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      ...(input.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
    signal: input.signal,
  })
  const text = await response.text()
  if (!text) return { status: response.status, unsubscribed: null }
  try {
    const json = JSON.parse(text) as { unsubscribed?: unknown }
    return {
      status: response.status,
      unsubscribed: json.unsubscribed === true ? true : json.unsubscribed === false ? false : null,
    }
  } catch {
    return { status: response.status, unsubscribed: null }
  }
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
  let created = 0
  let patched = 0
  let missingName = 0
  let skipped = 0
  let failed = 0
  let stale = 0

  for (let index = 0; index < MAX_JOBS_PER_INVOCATION; index += 1) {
    const { data: claimedRows, error: claimError } = await admin.rpc(
      'claim_ensure_contact_jobs',
      { limit_count: 1 }
    )
    if (claimError) {
      return NextResponse.json({ error: 'Could not claim ensure_contact jobs.' }, { status: 500 })
    }

    const job = ((claimedRows ?? []) as SyncJob[])[0]
    if (!job) break
    if (job.action !== 'ensure_contact') {
      return NextResponse.json({ error: 'Claim returned an unexpected action.' }, { status: 500 })
    }
    claimed += 1

    const finish = async (input: {
      status: 'pending' | 'synced' | 'skipped' | 'failed'
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
      const decision = await runEnsureContactAttempt({
        readLocal: async () => {
          const { data, error } = await admin.rpc('recheck_email_marketing_sync', {
            target_job_id: job.id,
          })
          if (error) throw new Error('recheck_failed')
          const row = (Array.isArray(data) ? data[0] : data) as RecheckRow | undefined
          if (!row || row.decision === 'skip_no_email' || row.decision === 'missing_job') {
            return { email: null, givenName: null, familyName: null }
          }
          if (row.decision === 'missing_first_name') {
            return { email: row.recipient_email, givenName: null, familyName: row.family_name }
          }
          return {
            email: row.recipient_email,
            givenName: row.given_name,
            familyName: row.family_name,
          }
        },
        lookupProvider: async (email) => {
          const result = await providerRequest({
            url: `${RESEND_CONTACTS_URL}/${encodeURIComponent(email)}`,
            method: 'GET',
            apiKey,
            signal,
          })
          if (result.status === 404) return 'missing'
          if (result.status < 200 || result.status >= 300) throw new Error('provider_lookup_failed')
          return result.unsubscribed === true ? 'unsubscribed' : 'subscribed'
        },
        createContact: async (createInput) => {
          const result = await providerRequest({
            url: RESEND_CONTACTS_URL,
            method: 'POST',
            apiKey,
            body: contactWritePayload({
              method: 'POST',
              email: createInput.email,
              body: createInput.body satisfies EnsureContactCreateBody,
            }),
            signal,
          })
          if (result.status === 409) return 'conflict'
          if (result.status < 200 || result.status >= 300) throw new Error('provider_write_failed')
          return 'created'
        },
        patchName: async (patchInput) => {
          const result = await providerRequest({
            url: `${RESEND_CONTACTS_URL}/${encodeURIComponent(patchInput.email)}`,
            method: 'PATCH',
            apiKey,
            body: patchInput.body,
            signal,
          })
          if (result.status < 200 || result.status >= 300) throw new Error('provider_write_failed')
        },
      })

      const outcome = ensureContactCompletion(decision, job.attempt_count)
      const finished = await finish(outcome)
      if (!finished) {
        stale += 1
        continue
      }
      if (outcome.status === 'failed') failed += 1
      else if (decision === 'create_contact') created += 1
      else if (decision === 'patch_name') patched += 1
      else if (decision === 'missing_first_name') missingName += 1
      else skipped += 1
    } catch {
      const outcome = ensureContactProviderFailure(job.attempt_count)
      const finished = await finish(outcome)
      if (!finished) stale += 1
      else failed += 1
    }
  }

  return NextResponse.json({
    ok: true,
    claimed,
    created,
    patched,
    missingName,
    skipped,
    failed,
    stale,
  })
}
