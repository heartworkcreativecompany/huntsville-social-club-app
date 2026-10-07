import { describe, expect, it } from 'vitest'
import {
  ACTION_URLS,
  CONTACT_SYNC_FAILED,
  MISSING_FIRST_NAME,
  RESEND_CONTACTS_URL,
  RESEND_EVENTS_URL,
  WEBHOOK_SECRET_HEADER,
  createProductionDeps,
  eventKeyFor,
  explicitFirstNameFromDraft,
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
const EXPLICIT_FIRST_NAME = 'Pat'
const WEBHOOK_EMAIL = 'webhook-supplied@example.com'
const WEBHOOK_NAME = 'Webhook Name'

function draftWithFirstName(firstName: string) {
  return {
    profile: {
      firstName,
      lastName: 'Lovelace',
      displayName: FETCHED_NAME,
    },
  }
}

function loadedProfile(
  overrides: Partial<LoadedProfile> = {}
): LoadedProfile {
  return {
    email: FETCHED_EMAIL,
    application_draft: draftWithFirstName(EXPLICIT_FIRST_NAME),
    application_status: 'submitted',
    application_submission_version: 1,
    ...overrides,
  }
}

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

type RecordedRequest = {
  url: string
  method: string
  body: unknown
}

function createDeps(options?: {
  profile?: LoadedProfile | null
  claim?: 'claimed' | 'duplicate' | 'error'
  fetchImpl?: HandlerDeps['fetch']
  contactFetch?: (
    url: string,
    method: string,
    body: unknown
  ) => Response | Promise<Response>
  calls?: RecordedRequest[]
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

  const defaultContactFetch = (method: string) => {
    if (method === 'POST') {
      return new Response(JSON.stringify({ object: 'contact', id: 'con_1' }), {
        status: 201,
      })
    }
    if (method === 'PATCH') {
      return new Response(JSON.stringify({ object: 'contact', id: 'con_1' }), {
        status: 200,
      })
    }
    return new Response(
      JSON.stringify({
        object: 'contact',
        id: 'con_1',
        email: FETCHED_EMAIL,
        first_name: 'Existing',
        unsubscribed: true,
      }),
      { status: 200 }
    )
  }

  return {
    getEnv: (name) => env[name],
    fetch: async (input, init) => {
      order.push('fetch')
      const url = String(input)
      const method = (init?.method ?? 'GET').toUpperCase()
      let body: unknown = null
      if (init?.body) {
        try {
          body = JSON.parse(String(init.body))
        } catch {
          body = null
        }
      }
      options?.calls?.push({ url, method, body })
      if (url.startsWith(RESEND_CONTACTS_URL)) {
        return options?.contactFetch
          ? options.contactFetch(url, method, body)
          : defaultContactFetch(method)
      }
      return (options?.fetchImpl ?? defaultFetch)(input, init)
    },
    loadProfile: async () => {
      order.push('loadProfile')
      if (options?.profile === null) return null
      return options?.profile ?? loadedProfile()
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
          profile: loadedProfile({
            application_status: row.profileStatus,
          }),
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
      })
    }
  })

  it('re-fetches email server-side and ignores webhook recipient fields', async () => {
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
    expect(sent?.email).not.toBe(WEBHOOK_EMAIL)
    expect(JSON.stringify(sent)).not.toContain(WEBHOOK_NAME)
    expect(JSON.stringify(sent)).not.toContain(FETCHED_NAME)
    expect(JSON.stringify(sent)).not.toContain(EXPLICIT_FIRST_NAME)
  })

  it('sends exactly the documented event and email fields', async () => {
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
    expect(Object.keys(sent ?? {}).sort()).toEqual(['email', 'event'])
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
    expect(haystack).not.toContain(EXPLICIT_FIRST_NAME)
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
        profile: loadedProfile(),
      })
    )
    expect(await response.json()).toEqual({ ok: true, result: 'sent' })
    expect(claimCalls[0]?.eventKey).toBe('application_submitted:1')
    expect(claimCalls[0]?.deliveryStatus).toBe('queued')
  })

  it('sends application_resubmitted:2 for needs_info → submitted at version 2', async () => {
    const claimCalls: AuditClaim[] = []
    let sent: Record<string, unknown> | undefined
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
        profile: loadedProfile({
          application_submission_version: 2,
        }),
        fetchImpl: async (_input, init) => {
          sent = JSON.parse(String(init?.body))
          return new Response(JSON.stringify({ id: 'evt_opaque_1' }), {
            status: 200,
          })
        },
      })
    )
    expect(await response.json()).toEqual({ ok: true, result: 'sent' })
    expect(claimCalls[0]?.eventKey).toBe('application_resubmitted:2')
    expect(claimCalls[0]?.eventName).toBe('application_resubmitted')
    expect(sent).toEqual({
      event: 'application_resubmitted',
      email: FETCHED_EMAIL,
    })
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
          profile: loadedProfile({
            application_submission_version: row.version,
          }),
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
        profile: loadedProfile(),
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
          profile: loadedProfile({
            application_status: row.status,
            application_submission_version: row.version,
          }),
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

  it('posts the status event only to the documented events endpoint', async () => {
    const calls: RecordedRequest[] = []
    await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({ calls })
    )
    const eventCalls = calls.filter((call) => call.url === RESEND_EVENTS_URL)
    expect(eventCalls).toHaveLength(1)
    expect(eventCalls[0]?.method).toBe('POST')
    expect(calls.every((call) => call.url.startsWith('https://api.resend.com/'))).toBe(
      true
    )
  })
})

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status })
}

describe('contact first_name sync', () => {
  it('uses the explicit application first name instead of the display name', () => {
    expect(
      explicitFirstNameFromDraft({
        profile: { firstName: '  Pat  ', displayName: FETCHED_NAME },
      })
    ).toBe('Pat')
    expect(
      explicitFirstNameFromDraft({
        profile: { firstName: '   ', displayName: FETCHED_NAME },
      })
    ).toBeNull()
    expect(explicitFirstNameFromDraft({ profile: { displayName: FETCHED_NAME } })).toBe(
      null
    )
  })

  it('updates an existing contact first_name before the status event', async () => {
    const calls: RecordedRequest[] = []
    const response = await handleApplicationStatusEmailRequest(
      jsonRequest(
        webhookPayload({ previousStatus: 'in_review', nextStatus: 'approved' })
      ),
      createDeps({
        calls,
        profile: loadedProfile({ application_status: 'approved' }),
      })
    )
    expect(await response.json()).toEqual({ ok: true, result: 'sent' })
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      `GET ${RESEND_CONTACTS_URL}/${encodeURIComponent(FETCHED_EMAIL)}`,
      `PATCH ${RESEND_CONTACTS_URL}/${encodeURIComponent(FETCHED_EMAIL)}`,
      `POST ${RESEND_EVENTS_URL}`,
    ])
    expect(calls[1]?.body).toEqual({ first_name: EXPLICIT_FIRST_NAME })
    expect(JSON.stringify(calls[1]?.body)).not.toContain(FETCHED_NAME)
    expect(calls[2]?.body).toEqual({
      event: 'application_approved',
      email: FETCHED_EMAIL,
    })
  })

  it('creates a missing contact with email and explicit first_name only', async () => {
    const calls: RecordedRequest[] = []
    const response = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({
        calls,
        contactFetch: (_url, method) => {
          if (method === 'GET') return jsonResponse({ name: 'not_found' }, 404)
          return jsonResponse({ object: 'contact', id: 'con_1' }, 201)
        },
      })
    )
    expect(await response.json()).toEqual({ ok: true, result: 'sent' })
    const create = calls.find(
      (call) => call.method === 'POST' && call.url === RESEND_CONTACTS_URL
    )
    expect(create?.body).toEqual({
      email: FETCHED_EMAIL,
      first_name: EXPLICIT_FIRST_NAME,
    })
    expect(Object.keys(create?.body as object).sort()).toEqual([
      'email',
      'first_name',
    ])
    expect(calls.at(-1)?.url).toBe(RESEND_EVENTS_URL)
  })

  it('patches first_name after a documented concurrent create lock', async () => {
    const calls: RecordedRequest[] = []
    let gets = 0
    const response = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({
        calls,
        contactFetch: (_url, method, body) => {
          if (method === 'GET') {
            gets += 1
            if (gets === 1) return jsonResponse({ name: 'not_found' }, 404)
            return jsonResponse(
              {
                object: 'contact',
                id: 'con_1',
                first_name: null,
                unsubscribed: true,
              },
              200
            )
          }
          if (method === 'POST') {
            return jsonResponse({ name: 'resource_locked' }, 409)
          }
          expect(body).toEqual({ first_name: EXPLICIT_FIRST_NAME })
          return jsonResponse({ object: 'contact', id: 'con_1' }, 200)
        },
      })
    )
    expect(await response.json()).toEqual({ ok: true, result: 'sent' })
    const writes = calls.filter((call) => call.method !== 'GET')
    expect(writes.map((call) => call.body)).toEqual([
      { email: FETCHED_EMAIL, first_name: EXPLICIT_FIRST_NAME },
      { first_name: EXPLICIT_FIRST_NAME },
      { event: 'application_submitted', email: FETCHED_EMAIL },
    ])
  })

  it('retries a locked create once when the contact is still missing', async () => {
    const calls: RecordedRequest[] = []
    let posts = 0
    const response = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({
        calls,
        contactFetch: (_url, method) => {
          if (method === 'GET') return jsonResponse({ name: 'not_found' }, 404)
          posts += 1
          if (posts === 1) return jsonResponse({ name: 'resource_locked' }, 409)
          return jsonResponse({ object: 'contact', id: 'con_1' }, 201)
        },
      })
    )
    expect(await response.json()).toEqual({ ok: true, result: 'sent' })
    const creates = calls.filter(
      (call) => call.method === 'POST' && call.url === RESEND_CONTACTS_URL
    )
    expect(creates).toHaveLength(2)
    expect(creates[1]?.body).toEqual({
      email: FETCHED_EMAIL,
      first_name: EXPLICIT_FIRST_NAME,
    })
    expect(calls.at(-1)?.url).toBe(RESEND_EVENTS_URL)
  })

  it('patches first_name when a concurrent create appears before the lock retry', async () => {
    const calls: RecordedRequest[] = []
    let gets = 0
    await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({
        calls,
        contactFetch: (_url, method) => {
          if (method === 'GET') {
            gets += 1
            if (gets === 1) return jsonResponse({ name: 'not_found' }, 404)
            return jsonResponse(
              { object: 'contact', id: 'con_1', first_name: null },
              200
            )
          }
          if (method === 'POST') {
            return jsonResponse({ name: 'validation_error' }, 422)
          }
          return jsonResponse({ object: 'contact', id: 'con_1' }, 200)
        },
      })
    )
    expect(calls.filter((call) => call.method === 'POST' && call.url === RESEND_CONTACTS_URL)).toHaveLength(1)
    expect(calls.some((call) => call.method === 'PATCH')).toBe(true)
    expect(calls.at(-1)?.url).toBe(RESEND_EVENTS_URL)
  })

  it('does not send the status event when contact sync fails', async () => {
    const calls: RecordedRequest[] = []
    const updates: AuditPatch[] = []
    const response = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({
        calls,
        updates,
        contactFetch: () =>
          jsonResponse({ name: 'application_error', message: FETCHED_EMAIL }, 500),
      })
    )
    expect(await response.json()).toEqual({
      ok: false,
      error: 'failed',
      result: CONTACT_SYNC_FAILED,
    })
    expect(calls.some((call) => call.url === RESEND_EVENTS_URL)).toBe(false)
    expect(updates[0]).toMatchObject({
      deliveryStatus: 'failed',
      errorText: CONTACT_SYNC_FAILED,
      providerEmailId: null,
      metadata: { category: CONTACT_SYNC_FAILED },
    })
    expect(JSON.stringify(updates[0])).not.toContain(FETCHED_EMAIL)
    expect(JSON.stringify(updates[0])).not.toContain(EXPLICIT_FIRST_NAME)

    const retryOrder: string[] = []
    const retry = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({ claim: 'duplicate', order: retryOrder })
    )
    expect(await retry.json()).toEqual({ ok: true, result: 'duplicate' })
    expect(retryOrder).toEqual(['loadProfile', 'claimAudit'])
  })

  it('does not invent a contact name when the explicit first name is missing or blank', async () => {
    for (const draft of [
      { profile: { firstName: '', displayName: FETCHED_NAME } },
      { profile: { firstName: '   ', displayName: FETCHED_NAME } },
      null,
    ]) {
      const calls: RecordedRequest[] = []
      const updates: AuditPatch[] = []
      const response = await handleApplicationStatusEmailRequest(
        jsonRequest(webhookPayload({})),
        createDeps({
          calls,
          updates,
          profile: loadedProfile({ application_draft: draft }),
          contactFetch: (url, method) => {
            if (method === 'GET') return jsonResponse({ name: 'not_found' }, 404)
            throw new Error(`unexpected ${method} ${url}`)
          },
        })
      )
      expect(await response.json()).toEqual({
        ok: false,
        error: 'failed',
        result: MISSING_FIRST_NAME,
      })
      expect(calls.map((call) => call.method)).toEqual(['GET'])
      expect(updates[0]?.errorText).toBe(MISSING_FIRST_NAME)
      expect(JSON.stringify(updates[0])).not.toContain(FETCHED_NAME)
    }
  })

  it('keeps an existing contact name when no explicit first name is available', async () => {
    const calls: RecordedRequest[] = []
    const response = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({
        calls,
        profile: loadedProfile({
          application_draft: { profile: { firstName: '', displayName: FETCHED_NAME } },
        }),
        contactFetch: (_url, method) => {
          if (method !== 'GET') throw new Error(`unexpected ${method}`)
          return jsonResponse(
            {
              object: 'contact',
              id: 'con_1',
              first_name: 'Kept',
              unsubscribed: true,
            },
            200
          )
        },
      })
    )
    expect(await response.json()).toEqual({ ok: true, result: 'sent' })
    expect(calls.map((call) => call.method)).toEqual(['GET', 'POST'])
    expect(calls[1]?.url).toBe(RESEND_EVENTS_URL)
    expect(JSON.stringify(calls)).not.toContain('Kept')
  })

  it('reports missing_first_name when neither side has a usable name', async () => {
    const calls: RecordedRequest[] = []
    const response = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({
        calls,
        profile: loadedProfile({ application_draft: null }),
        contactFetch: () =>
          jsonResponse(
            { object: 'contact', id: 'con_1', first_name: '  ', unsubscribed: false },
            200
          ),
      })
    )
    expect(await response.json()).toMatchObject({ result: MISSING_FIRST_NAME })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.method).toBe('GET')
  })

  it('does not send subscription, segment, topic, or suppression fields', async () => {
    const calls: RecordedRequest[] = []
    await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({ calls })
    )
    for (const call of calls) {
      const serialized = JSON.stringify(call.body)
      expect(serialized).not.toContain('unsubscribed')
      expect(serialized).not.toContain('segments')
      expect(serialized).not.toContain('topics')
      expect(serialized).not.toContain('suppression')
    }
  })
})

const FORBIDDEN_AUDIT_COLUMNS = [
  'provider_email_id',
  'error_text',
  'provider_metadata',
] as const

describe('production application_email_log REST payloads', () => {
  const supabaseUrl = 'https://example.supabase.co'
  const serviceKey = 'test-service-role-key'

  function productionDeps(options?: {
    resendStatus?: number
    resendThrow?: boolean
    restBodies?: Record<string, unknown>[]
  }) {
    const restBodies = options?.restBodies ?? []
    return createProductionDeps(
      (name) =>
        ({
          APPLICATION_STATUS_WEBHOOK_SECRET: WEBHOOK_SECRET,
          RESEND_API_KEY: RESEND_KEY,
          SUPABASE_URL: supabaseUrl,
          SUPABASE_SERVICE_ROLE_KEY: serviceKey,
        })[name],
      async (input, init) => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (url.includes('/rest/v1/profiles')) {
          restBodies.push({ method, url, body: null })
          return new Response(
            JSON.stringify([
              {
                email: FETCHED_EMAIL,
                application_draft: draftWithFirstName(EXPLICIT_FIRST_NAME),
                application_status: 'submitted',
                application_submission_version: 1,
              },
            ]),
            { status: 200 }
          )
        }
        if (url.includes('/rest/v1/application_email_log')) {
          restBodies.push({
            method,
            url,
            body: JSON.parse(String(init?.body ?? '{}')),
          })
          if (method === 'POST') {
            return new Response(JSON.stringify([{ id: AUDIT_ID }]), {
              status: 201,
            })
          }
          return new Response(null, { status: 200 })
        }
        if (url.startsWith(RESEND_CONTACTS_URL)) {
          if ((init?.method ?? 'GET').toUpperCase() === 'GET') {
            return new Response(
              JSON.stringify({
                object: 'contact',
                id: 'con_1',
                first_name: null,
                unsubscribed: true,
              }),
              { status: 200 }
            )
          }
          return new Response(JSON.stringify({ object: 'contact', id: 'con_1' }), {
            status: 200,
          })
        }
        if (options?.resendThrow) {
          throw new Error('connect ECONNREFUSED')
        }
        return new Response(JSON.stringify({ id: 'evt_opaque_1' }), {
          status: options?.resendStatus ?? 200,
        })
      }
    )
  }

  it('claims with production column names and never sends retired audit fields', async () => {
    const restBodies: Record<string, unknown>[] = []
    await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      productionDeps({ restBodies })
    )
    const insert = restBodies.find((row) => row.method === 'POST')
      ?.body as Record<string, unknown>
    expect(insert).toEqual({
      application_id: PROFILE_ID,
      recipient_user_id: PROFILE_ID,
      recipient_email: FETCHED_EMAIL,
      event_key: 'application_submitted:1',
      application_status: 'submitted',
      delivery_status: 'queued',
      error_message: null,
      provider_event: {
        event: 'application_submitted',
        stage: 'claimed',
      },
    })
    const serialized = JSON.stringify(restBodies)
    for (const column of FORBIDDEN_AUDIT_COLUMNS) {
      expect(serialized).not.toContain(column)
    }
    const profileGet = restBodies.find((row) =>
      String(row.url).includes('/rest/v1/profiles')
    )
    expect(String(profileGet?.url)).toContain('application_draft')
    expect(String(profileGet?.url)).not.toContain('full_name')
  })

  it('patches sent using resend_email_id, error_message, and provider_event', async () => {
    const restBodies: Record<string, unknown>[] = []
    await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      productionDeps({ restBodies })
    )
    const patch = restBodies.find((row) => row.method === 'PATCH')
      ?.body as Record<string, unknown>
    expect(patch).toEqual({
      delivery_status: 'sent',
      error_message: null,
      resend_email_id: 'evt_opaque_1',
      provider_event: {
        event: 'application_submitted',
        http_status_category: '2xx',
      },
    })
    for (const column of FORBIDDEN_AUDIT_COLUMNS) {
      expect(JSON.stringify(patch)).not.toContain(column)
    }
  })

  it('patches failed using sanitized error_message and production columns only', async () => {
    const restBodies: Record<string, unknown>[] = []
    await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      productionDeps({ restBodies, resendStatus: 500 })
    )
    const patch = restBodies.find((row) => row.method === 'PATCH')
      ?.body as Record<string, unknown>
    expect(patch).toEqual({
      delivery_status: 'failed',
      error_message: 'resend_5xx',
      resend_email_id: null,
      provider_event: {
        event: 'application_submitted',
        http_status_category: '5xx',
        category: 'resend_5xx',
      },
    })
    for (const column of FORBIDDEN_AUDIT_COLUMNS) {
      expect(JSON.stringify(patch)).not.toContain(column)
    }
  })
})
