import { describe, expect, it } from 'vitest'
import {
  ACTION_URLS,
  RESEND_EVENTS_URL,
  WEBHOOK_SECRET_HEADER,
  eventKeyFor,
  handleApplicationStatusEmailRequest,
  mapStatusTransition,
  parsePositiveSubmissionVersion,
  type AuditClaim,
  type AuditPatch,
  type HandlerDeps,
  type LoadedProfile,
} from './handler.ts'

const WEBHOOK_SECRET = 'test-webhook-secret'
const RESEND_KEY = 'test-resend-key'
const PROFILE_ID = '11111111-1111-4111-8111-111111111111'
const AUDIT_ID = '22222222-2222-4222-8222-222222222222'
const FETCHED_EMAIL = 'applicant@example.com'
const FETCHED_NAME = 'Ada Lovelace'
const WEBHOOK_EMAIL = 'webhook-supplied@example.com'
const WEBHOOK_NAME = 'Webhook Name'

function webhookPayload(input: {
  type?: string
  schema?: string
  table?: string
  id?: string
  previousStatus?: string
  nextStatus?: string
  email?: string
  full_name?: string
  application_submission_version?: unknown
}) {
  return {
    type: input.type ?? 'UPDATE',
    schema: input.schema ?? 'public',
    table: input.table ?? 'profiles',
    record: {
      id: input.id ?? PROFILE_ID,
      application_status: input.nextStatus ?? 'submitted',
      email: input.email ?? WEBHOOK_EMAIL,
      full_name: input.full_name ?? WEBHOOK_NAME,
      application_submission_version:
        input.application_submission_version === undefined
          ? 1
          : input.application_submission_version,
    },
    old_record: {
      id: input.id ?? PROFILE_ID,
      application_status: input.previousStatus ?? 'draft',
      email: input.email ?? WEBHOOK_EMAIL,
      full_name: input.full_name ?? WEBHOOK_NAME,
    },
  }
}

function jsonRequest(
  payload: unknown,
  init?: { method?: string; secret?: string | null }
) {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (init?.secret !== null) {
    headers.set(WEBHOOK_SECRET_HEADER, init?.secret ?? WEBHOOK_SECRET)
  }
  return new Request('http://function.local/application-status-email', {
    method: init?.method ?? 'POST',
    headers,
    body:
      (init?.method ?? 'POST') === 'GET' || (init?.method ?? 'POST') === 'HEAD'
        ? undefined
        : JSON.stringify(payload),
  })
}

function createDeps(options?: {
  profile?: LoadedProfile | null
  claim?: 'claimed' | 'duplicate' | 'error'
  fetchImpl?: HandlerDeps['fetch']
  loadCalls?: string[]
  claimCalls?: AuditClaim[]
  updates?: AuditPatch[]
  logs?: string[]
  order?: string[]
  env?: Record<string, string | undefined>
}): HandlerDeps {
  const logs = options?.logs ?? []
  const order = options?.order ?? []
  const claimCalls = options?.claimCalls ?? []
  const updates = options?.updates ?? []
  const env = {
    APPLICATION_STATUS_WEBHOOK_SECRET: WEBHOOK_SECRET,
    RESEND_API_KEY: RESEND_KEY,
    ...options?.env,
  }

  const defaultFetch: HandlerDeps['fetch'] = async () =>
    new Response(JSON.stringify({ id: 'evt_opaque_1' }), { status: 200 })

  return {
    getEnv: (name) => env[name],
    fetch: async (input, init) => {
      order.push('fetch')
      return (options?.fetchImpl ?? defaultFetch)(input, init)
    },
    loadProfile: async () => {
      order.push('loadProfile')
      if (options?.profile === null) return null
      return (
        options?.profile ?? {
          email: FETCHED_EMAIL,
          full_name: FETCHED_NAME,
          application_status: 'submitted',
          application_submission_version: 1,
        }
      )
    },
    claimAudit: async (row) => {
      order.push('claimAudit')
      claimCalls.push(row)
      if (options?.claim === 'duplicate') return { status: 'duplicate' }
      if (options?.claim === 'error') return { status: 'error' }
      return { status: 'claimed', id: AUDIT_ID }
    },
    updateAudit: async (_id, patch) => {
      order.push('updateAudit')
      updates.push(patch)
    },
    log: (message) => {
      logs.push(message)
    },
  }
}

async function parsed(response: Response) {
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
    text: '',
  }
}

describe('parsePositiveSubmissionVersion', () => {
  it('accepts only positive integers', () => {
    expect(parsePositiveSubmissionVersion(1)).toBe(1)
    expect(parsePositiveSubmissionVersion(2)).toBe(2)
    expect(parsePositiveSubmissionVersion('3')).toBe(3)
    expect(parsePositiveSubmissionVersion(0)).toBeNull()
    expect(parsePositiveSubmissionVersion(-1)).toBeNull()
    expect(parsePositiveSubmissionVersion(1.5)).toBeNull()
    expect(parsePositiveSubmissionVersion('1.0')).toBeNull()
    expect(parsePositiveSubmissionVersion('abc')).toBeNull()
    expect(parsePositiveSubmissionVersion(null)).toBeNull()
    expect(parsePositiveSubmissionVersion(undefined)).toBeNull()
    expect(parsePositiveSubmissionVersion(true)).toBeNull()
  })
})

describe('mapStatusTransition', () => {
  it('maps the four approved transitions and skips in_review / unchanged', () => {
    expect(mapStatusTransition('draft', 'submitted')).toEqual({
      eventName: 'application_submitted',
      actionUrl: ACTION_URLS.application_submitted,
    })
    expect(mapStatusTransition('needs_info', 'submitted')).toEqual({
      eventName: 'application_submitted',
      actionUrl: ACTION_URLS.application_submitted,
    })
    expect(mapStatusTransition('submitted', 'needs_info')).toEqual({
      eventName: 'application_needs_info',
      actionUrl: ACTION_URLS.application_needs_info,
    })
    expect(mapStatusTransition('in_review', 'approved')).toEqual({
      eventName: 'application_approved',
      actionUrl: ACTION_URLS.application_approved,
    })
    expect(mapStatusTransition('submitted', 'rejected')).toEqual({
      eventName: 'application_rejected',
      actionUrl: ACTION_URLS.application_rejected,
    })
    expect(mapStatusTransition('draft', 'in_review')).toBeNull()
    expect(mapStatusTransition('submitted', 'submitted')).toBeNull()
    expect(mapStatusTransition('rejected', 'submitted')).toBeNull()
  })
})

describe('application-status-email handler', () => {
  it('returns 405 for non-POST', async () => {
    const deps = createDeps()
    const response = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({}), { method: 'GET' }),
      deps
    )
    const result = await parsed(response)
    expect(result.status).toBe(405)
    expect(result.body).toEqual({ ok: false, error: 'method_not_allowed' })
  })

  it('rejects missing or invalid secret before parsing or querying', async () => {
    const order: string[] = []
    const missing = createDeps({ order })
    const missingRes = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({}), { secret: null }),
      missing
    )
    expect(missingRes.status).toBe(401)
    expect(order).toEqual([])

    const invalidOrder: string[] = []
    const invalid = createDeps({ order: invalidOrder })
    const invalidRes = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({}), { secret: 'wrong-secret' }),
      invalid
    )
    expect(invalidRes.status).toBe(401)
    expect(invalidOrder).toEqual([])
    expect(await invalidRes.json()).toEqual({
      ok: false,
      error: 'unauthorized',
    })
  })

  it('skips invalid schema, table, or event type', async () => {
    for (const payload of [
      webhookPayload({ schema: 'auth' }),
      webhookPayload({ table: 'application_email_log' }),
      webhookPayload({ type: 'INSERT' }),
    ]) {
      const order: string[] = []
      const response = await handleApplicationStatusEmailRequest(
        jsonRequest(payload),
        createDeps({ order })
      )
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ ok: true, result: 'skipped' })
      expect(order).toEqual([])
    }
  })

  it('skips unchanged application status', async () => {
    const order: string[] = []
    const response = await handleApplicationStatusEmailRequest(
      jsonRequest(
        webhookPayload({ previousStatus: 'submitted', nextStatus: 'submitted' })
      ),
      createDeps({ order })
    )
    expect(await response.json()).toEqual({ ok: true, result: 'skipped' })
    expect(order).toEqual([])
  })

  it('skips in_review', async () => {
    const order: string[] = []
    const response = await handleApplicationStatusEmailRequest(
      jsonRequest(
        webhookPayload({ previousStatus: 'submitted', nextStatus: 'in_review' })
      ),
      createDeps({ order })
    )
    expect(await response.json()).toEqual({ ok: true, result: 'skipped' })
    expect(order).toEqual([])
  })

  it('maps allowed transitions to exact event names and action URLs', async () => {
    const cases: Array<{
      previous: string
      next: string
      event: keyof typeof ACTION_URLS
      profileStatus: string
    }> = [
      {
        previous: 'draft',
        next: 'submitted',
        event: 'application_submitted',
        profileStatus: 'submitted',
      },
      {
        previous: 'needs_info',
        next: 'submitted',
        event: 'application_submitted',
        profileStatus: 'submitted',
      },
      {
        previous: 'submitted',
        next: 'needs_info',
        event: 'application_needs_info',
        profileStatus: 'needs_info',
      },
      {
        previous: 'in_review',
        next: 'approved',
        event: 'application_approved',
        profileStatus: 'approved',
      },
      {
        previous: 'needs_info',
        next: 'rejected',
        event: 'application_rejected',
        profileStatus: 'rejected',
      },
    ]

    for (const row of cases) {
      let sent: unknown
      const response = await handleApplicationStatusEmailRequest(
        jsonRequest(
          webhookPayload({
            previousStatus: row.previous,
            nextStatus: row.next,
          })
        ),
        createDeps({
          profile: {
            email: FETCHED_EMAIL,
            full_name: FETCHED_NAME,
            application_status: row.profileStatus,
            application_submission_version: 1,
          },
          fetchImpl: async (_input, init) => {
            sent = JSON.parse(String(init?.body))
            return new Response(JSON.stringify({ id: 'evt_opaque_1' }), {
              status: 200,
            })
          },
        })
      )
      expect(await response.json()).toEqual({ ok: true, result: 'sent' })
      expect(sent).toEqual({
        event: row.event,
        email: FETCHED_EMAIL,
        first_name: 'Ada',
        action_url: ACTION_URLS[row.event],
      })
    }
  })

  it('re-fetches email and name server-side and ignores webhook recipient fields', async () => {
    let sent: Record<string, unknown> | undefined
    await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({
        fetchImpl: async (_input, init) => {
          sent = JSON.parse(String(init?.body))
          return new Response(JSON.stringify({ id: 'evt_opaque_1' }), {
            status: 200,
          })
        },
      })
    )
    expect(sent?.email).toBe(FETCHED_EMAIL)
    expect(sent?.first_name).toBe('Ada')
    expect(sent?.email).not.toBe(WEBHOOK_EMAIL)
    expect(JSON.stringify(sent)).not.toContain(WEBHOOK_NAME)
  })

  it('sends exactly event, email, first_name, and action_url', async () => {
    let sent: Record<string, unknown> | undefined
    await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({
        fetchImpl: async (_input, init) => {
          sent = JSON.parse(String(init?.body))
          return new Response(JSON.stringify({ id: 'evt_opaque_1' }), {
            status: 200,
          })
        },
      })
    )
    expect(Object.keys(sent ?? {}).sort()).toEqual([
      'action_url',
      'email',
      'event',
      'first_name',
    ])
  })

  it('does not call Resend when the audit claim is a duplicate', async () => {
    const order: string[] = []
    const response = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({ claim: 'duplicate', order })
    )
    expect(await response.json()).toEqual({ ok: true, result: 'duplicate' })
    expect(order).toEqual(['loadProfile', 'claimAudit'])
    expect(order).not.toContain('fetch')
  })

  it('claims the audit row before the mocked Resend request', async () => {
    const order: string[] = []
    await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({ order })
    )
    expect(order.indexOf('claimAudit')).toBeGreaterThan(
      order.indexOf('loadProfile')
    )
    expect(order.indexOf('fetch')).toBeGreaterThan(order.indexOf('claimAudit'))
    expect(eventKeyFor('application_submitted', 1)).toBe(
      'application_submitted:1'
    )
  })

  it('updates audit to sent on an accepted Resend response', async () => {
    const updates: AuditPatch[] = []
    const response = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({ updates })
    )
    expect(await response.json()).toEqual({ ok: true, result: 'sent' })
    expect(updates[0]).toMatchObject({
      deliveryStatus: 'sent',
      errorText: null,
      providerEmailId: 'evt_opaque_1',
      metadata: {
        event: 'application_submitted',
        http_status_category: '2xx',
      },
    })
  })

  it('updates audit with a sanitized category on Resend or network failure', async () => {
    const four: AuditPatch[] = []
    await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({
        updates: four,
        fetchImpl: async () =>
          new Response(JSON.stringify({ secret: 'do-not-store' }), {
            status: 429,
          }),
      })
    )
    expect(four[0]).toMatchObject({
      deliveryStatus: 'failed',
      errorText: 'resend_4xx',
      metadata: { category: 'resend_4xx', http_status_category: '4xx' },
    })
    expect(JSON.stringify(four[0])).not.toContain('do-not-store')

    const net: AuditPatch[] = []
    await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({
        updates: net,
        fetchImpl: async () => {
          throw new Error('connect ECONNREFUSED')
        },
      })
    )
    expect(net[0]).toMatchObject({
      deliveryStatus: 'failed',
      errorText: 'network_error',
    })
    expect(JSON.stringify(net[0])).not.toContain('ECONNREFUSED')
  })

  it('keeps logs and responses free of email, secrets, and applicant details', async () => {
    const logs: string[] = []
    const response = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({ logs })
    )
    const body = JSON.stringify(await response.json())
    const haystack = `${body}\n${logs.join('\n')}`
    expect(haystack).not.toContain(FETCHED_EMAIL)
    expect(haystack).not.toContain(WEBHOOK_EMAIL)
    expect(haystack).not.toContain(WEBHOOK_SECRET)
    expect(haystack).not.toContain(RESEND_KEY)
    expect(haystack).not.toContain('Bearer')
    expect(haystack).not.toContain(PROFILE_ID)
    expect(haystack).not.toContain(WEBHOOK_NAME)
    expect(haystack).not.toContain(FETCHED_NAME)
  })

  it('sends application_submitted:1 for draft → submitted at version 1', async () => {
    const claimCalls: AuditClaim[] = []
    const response = await handleApplicationStatusEmailRequest(
      jsonRequest(
        webhookPayload({
          previousStatus: 'draft',
          nextStatus: 'submitted',
          application_submission_version: 1,
        })
      ),
      createDeps({
        claimCalls,
        profile: {
          email: FETCHED_EMAIL,
          full_name: FETCHED_NAME,
          application_status: 'submitted',
          application_submission_version: 1,
        },
      })
    )
    expect(await response.json()).toEqual({ ok: true, result: 'sent' })
    expect(claimCalls[0]?.eventKey).toBe('application_submitted:1')
    expect(claimCalls[0]?.deliveryStatus).toBe('queued')
  })

  it('sends application_submitted:2 for needs_info → submitted at version 2', async () => {
    const claimCalls: AuditClaim[] = []
    const response = await handleApplicationStatusEmailRequest(
      jsonRequest(
        webhookPayload({
          previousStatus: 'needs_info',
          nextStatus: 'submitted',
          application_submission_version: 2,
        })
      ),
      createDeps({
        claimCalls,
        profile: {
          email: FETCHED_EMAIL,
          full_name: FETCHED_NAME,
          application_status: 'submitted',
          application_submission_version: 2,
        },
      })
    )
    expect(await response.json()).toEqual({ ok: true, result: 'sent' })
    expect(claimCalls[0]?.eventKey).toBe('application_submitted:2')
  })

  it('retries of the same transition/version are duplicate and do not call Resend', async () => {
    const retries = [
      {
        previous: 'draft',
        next: 'submitted',
        version: 1,
      },
      {
        previous: 'needs_info',
        next: 'submitted',
        version: 2,
      },
    ] as const

    for (const row of retries) {
      const order: string[] = []
      const response = await handleApplicationStatusEmailRequest(
        jsonRequest(
          webhookPayload({
            previousStatus: row.previous,
            nextStatus: row.next,
            application_submission_version: row.version,
          })
        ),
        createDeps({
          claim: 'duplicate',
          order,
          profile: {
            email: FETCHED_EMAIL,
            full_name: FETCHED_NAME,
            application_status: 'submitted',
            application_submission_version: row.version,
          },
        })
      )
      expect(await response.json()).toEqual({ ok: true, result: 'duplicate' })
      expect(order).toEqual(['loadProfile', 'claimAudit'])
      expect(order).not.toContain('fetch')
    }
  })

  it('skips when the webhook version does not match the re-fetched profile version', async () => {
    const order: string[] = []
    const response = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({ application_submission_version: 2 })),
      createDeps({
        order,
        profile: {
          email: FETCHED_EMAIL,
          full_name: FETCHED_NAME,
          application_status: 'submitted',
          application_submission_version: 1,
        },
      })
    )
    expect(await response.json()).toEqual({ ok: true, result: 'skipped' })
    expect(order).toEqual(['loadProfile'])
    expect(order).not.toContain('fetch')
    expect(order).not.toContain('claimAudit')
  })

  it('skips rejected → submitted without an intervening draft', async () => {
    const order: string[] = []
    const response = await handleApplicationStatusEmailRequest(
      jsonRequest(
        webhookPayload({
          previousStatus: 'rejected',
          nextStatus: 'submitted',
          application_submission_version: 2,
        })
      ),
      createDeps({ order })
    )
    expect(await response.json()).toEqual({ ok: true, result: 'skipped' })
    expect(order).toEqual([])
  })

  it('uses the current submission version in needs_info, approved, and rejected keys', async () => {
    const rows: Array<{
      previous: string
      next: string
      version: number
      event: keyof typeof ACTION_URLS
      status: string
    }> = [
      {
        previous: 'submitted',
        next: 'needs_info',
        version: 2,
        event: 'application_needs_info',
        status: 'needs_info',
      },
      {
        previous: 'in_review',
        next: 'approved',
        version: 1,
        event: 'application_approved',
        status: 'approved',
      },
      {
        previous: 'submitted',
        next: 'rejected',
        version: 3,
        event: 'application_rejected',
        status: 'rejected',
      },
    ]
    for (const row of rows) {
      const claimCalls: AuditClaim[] = []
      await handleApplicationStatusEmailRequest(
        jsonRequest(
          webhookPayload({
            previousStatus: row.previous,
            nextStatus: row.next,
            application_submission_version: row.version,
          })
        ),
        createDeps({
          claimCalls,
          profile: {
            email: FETCHED_EMAIL,
            full_name: FETCHED_NAME,
            application_status: row.status,
            application_submission_version: row.version,
          },
        })
      )
      expect(claimCalls[0]?.eventKey).toBe(`${row.event}:${row.version}`)
    }
  })

  it('claims queued then marks sent on accepted Resend', async () => {
    const claimCalls: AuditClaim[] = []
    const updates: AuditPatch[] = []
    await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({ claimCalls, updates })
    )
    expect(claimCalls[0]?.deliveryStatus).toBe('queued')
    expect(updates[0]?.deliveryStatus).toBe('sent')
  })

  it('moves queued claims to failed with a sanitized category', async () => {
    const claimCalls: AuditClaim[] = []
    const updates: AuditPatch[] = []
    await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({
        claimCalls,
        updates,
        fetchImpl: async () => new Response('nope', { status: 500 }),
      })
    )
    expect(claimCalls[0]?.deliveryStatus).toBe('queued')
    expect(updates[0]).toMatchObject({
      deliveryStatus: 'failed',
      errorText: 'resend_5xx',
    })
  })

  it('skips missing, zero, negative, non-integer, or invalid submission versions', async () => {
    for (const version of [undefined, 0, -1, 1.5, '1.0', 'abc', null, true]) {
      const order: string[] = []
      const payload = webhookPayload({})
      if (version === undefined) {
        delete payload.record.application_submission_version
      } else {
        payload.record.application_submission_version = version
      }
      const response = await handleApplicationStatusEmailRequest(
        jsonRequest(payload),
        createDeps({ order })
      )
      expect(await response.json()).toEqual({ ok: true, result: 'skipped' })
      expect(order).not.toContain('fetch')
      expect(order).not.toContain('claimAudit')
    }
  })

  it('posts only to the Resend events endpoint', async () => {
    let url = ''
    await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({
        fetchImpl: async (input) => {
          url = String(input)
          return new Response(JSON.stringify({ id: 'evt_opaque_1' }), {
            status: 200,
          })
        },
      })
    )
    expect(url).toBe(RESEND_EVENTS_URL)
  })
})
