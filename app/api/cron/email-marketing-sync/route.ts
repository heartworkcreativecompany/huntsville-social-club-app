import { NextResponse } from 'next/server'
import {
  nextMarketingSyncDelaySeconds,
  runEmailMarketingSyncAttempt,
  type LocalMarketingConsent,
} from '@/lib/email-marketing-sync'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const RESEND_CONTACTS_URL = 'https://api.resend.com/contacts'

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  return request.headers.get('authorization') === `Bearer ${cronSecret}`
}

type SyncJob = {
  id: string
  profile_id: string
  action: 'enroll' | 'withdraw'
}

type RecheckRow = {
  decision: string
  recipient_email: string | null
}

async function lookupProvider(
  email: string,
  apiKey: string
): Promise<'missing' | 'subscribed' | 'unsubscribed'> {
  const response = await fetch(
    `${RESEND_CONTACTS_URL}/${encodeURIComponent(email)}`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
    }
  )
  if (response.status === 404) return 'missing'
  if (!response.ok) {
    throw new Error('provider_lookup_failed')
  }
  const body = (await response.json()) as { unsubscribed?: unknown }
  return body.unsubscribed === true ? 'unsubscribed' : 'subscribed'
}

async function sendSubscription(input: {
  email: string
  body: { unsubscribed: boolean }
  method: 'POST' | 'PATCH'
  apiKey: string
}) {
  const url =
    input.method === 'POST'
      ? RESEND_CONTACTS_URL
      : `${RESEND_CONTACTS_URL}/${encodeURIComponent(input.email)}`
  const payload =
    input.method === 'POST'
      ? { email: input.email, unsubscribed: input.body.unsubscribed }
      : { unsubscribed: input.body.unsubscribed }
  const response = await fetch(url, {
    method: input.method,
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error('provider_write_failed')
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

  const { data: claimed, error: claimError } = await admin.rpc(
    'claim_email_marketing_sync_jobs',
    { limit_count: 20 }
  )
  if (claimError) {
    return NextResponse.json({ error: 'Could not claim sync jobs.' }, { status: 500 })
  }

  const jobs = (claimed ?? []) as SyncJob[]
  let synced = 0
  let skipped = 0
  let deferred = 0
  let failed = 0

  for (const job of jobs) {
    const readLocal = async (): Promise<LocalMarketingConsent> => {
      const { data, error } = await admin.rpc('recheck_email_marketing_sync', {
        target_job_id: job.id,
      })
      if (error) throw new Error('recheck_failed')
      const row = (Array.isArray(data) ? data[0] : data) as RecheckRow | undefined
      if (!row) {
        return {
          email: null,
          emailConfirmed: false,
          optIn: false,
          optedOutAt: null,
        }
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
      if (row.decision === 'skip_no_email' || row.decision === 'missing_job') {
        return {
          email: null,
          emailConfirmed: false,
          optIn: false,
          optedOutAt: null,
        }
      }
      return {
        email: row.recipient_email,
        emailConfirmed: true,
        optIn: job.action === 'enroll',
        optedOutAt: null,
      }
    }

    try {
      const decision = await runEmailMarketingSyncAttempt({
        action: job.action,
        readLocal,
        lookupProvider: (email) => lookupProvider(email, apiKey),
        send: (sendInput) => sendSubscription({ ...sendInput, apiKey }),
        recordProviderUnsubscribe: async (email) => {
          const { error } = await admin.rpc('apply_resend_contact_unsubscribe', {
            target_email: email,
            provider_event_id: `provider-unsubscribed:${job.id}`,
          })
          if (error) throw new Error('provider_unsubscribe_record_failed')
        },
      })

      if (decision === 'defer_unconfirmed') {
        const { data: attemptRows } = await admin
          .from('email_marketing_sync')
          .select('attempt_count')
          .eq('id', job.id)
          .maybeSingle()
        const attemptCount = attemptRows?.attempt_count ?? 1
        const delay = nextMarketingSyncDelaySeconds(attemptCount)
        if (delay === null) {
          await admin
            .from('email_marketing_sync')
            .update({
              status: 'failed',
              last_error: 'unconfirmed',
              updated_at: new Date().toISOString(),
            })
            .eq('id', job.id)
          failed += 1
        } else {
          await admin
            .from('email_marketing_sync')
            .update({
              status: 'pending',
              next_attempt_at: new Date(Date.now() + delay * 1000).toISOString(),
              last_error: 'unconfirmed',
              updated_at: new Date().toISOString(),
            })
            .eq('id', job.id)
          deferred += 1
        }
        continue
      }

      const skippedDecision =
        decision === 'skip_withdrawn' ||
        decision === 'skip_not_opted_in' ||
        decision === 'skip_no_email' ||
        decision === 'record_provider_unsubscribe' ||
        decision === 'missing_job'

      await admin
        .from('email_marketing_sync')
        .update({
          status: skippedDecision ? 'skipped' : 'synced',
          last_error: skippedDecision ? decision : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id)

      if (skippedDecision) skipped += 1
      else synced += 1
    } catch {
      const { data: attemptRows } = await admin
        .from('email_marketing_sync')
        .select('attempt_count')
        .eq('id', job.id)
        .maybeSingle()
      const attemptCount = attemptRows?.attempt_count ?? 1
      const delay = nextMarketingSyncDelaySeconds(attemptCount)
      await admin
        .from('email_marketing_sync')
        .update({
          status: delay === null ? 'failed' : 'pending',
          next_attempt_at:
            delay === null
              ? null
              : new Date(Date.now() + delay * 1000).toISOString(),
          last_error: 'provider_error',
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id)
      failed += 1
    }
  }

  return NextResponse.json({ ok: true, claimed: jobs.length, synced, skipped, deferred, failed })
}
