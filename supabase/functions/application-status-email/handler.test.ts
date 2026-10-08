import { describe, expect, it } from 'vitest'
import {
  PRE_SEND_LEASE_SECONDS,
  PRE_SEND_PERSIST_MARGIN_MS,
  createMemoryAuditLease,
  retryNextAttemptAt,
  seedEmailAttempt,
  type AuditLease,
  type EmailAttempt,
} from './audit-lease.ts'
import {
  ACTION_URLS,
  CONTACT_SYNC_FAILED,
  MISSING_FIRST_NAME,
  RESEND_CONTACTS_URL,
  RESEND_EVENTS_URL,
  RETRY_SECRET_HEADER,
  WEBHOOK_SECRET_HEADER,
  createProductionDeps,
  eventKeyFor,
  explicitFirstNameFromDraft,
  handleApplicationStatusEmailRequest,
  mapStatusTransition,
  parsePositiveSubmissionVersion,
  type AuditClaim,
  type HandlerDeps,
  type LoadedProfile,
} from './handler.ts'

const WEBHOOK_SECRET = 'test-webhook-secret'
const RESEND_KEY = 'test-resend-key'
const RETRY_SECRET = 'test-retry-secret'

function acceptedEventResponse() {
  return new Response(
    JSON.stringify({ object: 'event', event: 'application_submitted' }),
    { status: 202 }
  )
}
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

function abortRejection(signal: AbortSignal | undefined): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (!signal) return
    const fail = () =>
      reject(new DOMException('The operation was aborted.', 'AbortError'))
    if (signal.aborted) {
      fail()
      return
    }
    signal.addEventListener('abort', fail, { once: true })
  })
}

function createDeps(options?: {
  profile?: LoadedProfile | null | 'error'
  profiles?: Array<LoadedProfile | null | 'error'>
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
  transitions?: EmailAttempt[]
  logs?: string[]
  order?: string[]
  env?: Record<string, string | undefined>
  audit?: AuditLease
  now?: () => Date
  beforeEventConfirmation?: () => Promise<void>
}): HandlerDeps & { audit: AuditLease } {
  const logs = options?.logs ?? []
  const order = options?.order ?? []
  const claimCalls = options?.claimCalls ?? []
  const transitions = options?.transitions ?? []
  const env = {
    APPLICATION_STATUS_WEBHOOK_SECRET: WEBHOOK_SECRET,
    RESEND_API_KEY: RESEND_KEY,
    APPLICATION_STATUS_RETRY_SECRET: RETRY_SECRET,
    ...options?.env,
  }
  const audit = options?.audit ?? createMemoryAuditLease(options?.now ?? (() => new Date()))
  const insertPending = audit.insertPending.bind(audit)
  audit.insertPending = async (input) => {
    order.push('insertAudit')
    if (options?.claim === 'error') return { error: true }
    if (options?.claim === 'duplicate') {
      seedEmailAttempt(audit, {
        id: AUDIT_ID,
        applicationId: input.applicationId,
        recipientEmail: input.recipientEmail,
        eventKey: input.eventKey,
        applicationStatus: input.applicationStatus,
        resendEventName: input.resendEventName,
        submissionVersion: input.submissionVersion,
        processingState: 'event_accepted',
        claimToken: null,
        claimedUntil: null,
        attemptCount: 0,
        nextAttemptAt: null,
        deliveryStatus: 'unconfirmed',
        errorMessage: null,
        resendEmailId: null,
        providerEvent: { category: 'event_accepted' },
      })
    }
    const result = await insertPending(input)
    if (!('error' in result)) {
      claimCalls.push({
        applicationId: input.applicationId,
        recipientEmail: input.recipientEmail,
        eventKey: input.eventKey,
        applicationStatus: input.applicationStatus as AuditClaim['applicationStatus'],
        eventName: input.resendEventName as AuditClaim['eventName'],
        deliveryStatus: 'queued',
      })
    }
    return result
  }
  const transition = audit.transition.bind(audit)
  audit.transition = async (input) => {
    order.push('transition')
    const row = await transition(input)
    if (row) transitions.push(row)
    return row
  }

  const defaultFetch: HandlerDeps['fetch'] = async () => acceptedEventResponse()

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

  let profileReads = 0
  return {
    getEnv: (name) => env[name],
    audit,
    delay: async () => {},
    beforeEventConfirmation: options?.beforeEventConfirmation,
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
        const response = options?.contactFetch
          ? options.contactFetch(url, method, body)
          : defaultContactFetch(method)
        return await Promise.race([
          Promise.resolve(response),
          abortRejection(init?.signal ?? undefined),
        ])
      }
      return (options?.fetchImpl ?? defaultFetch)(input, init)
    },
    loadProfile: async () => {
      order.push('loadProfile')
      profileReads += 1
      const fixture = options?.profiles
        ? (options.profiles[Math.min(profileReads - 1, options.profiles.length - 1)] ??
          null)
        : options?.profile === undefined
          ? loadedProfile()
          : options.profile
      if (fixture === 'error') return { status: 'error' }
      if (!fixture) return { status: 'absent' }
      return { status: 'found', profile: fixture }
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
            return acceptedEventResponse()
          },
        })
      )
      expect(await response.json()).toEqual({ ok: true, result: 'event_accepted' })
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
          return acceptedEventResponse()
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
          return acceptedEventResponse()
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
    expect(order).toEqual(['insertAudit'])
    expect(order).not.toContain('fetch')
    expect(order).not.toContain('loadProfile')
  })

  it('claims the audit row before the mocked Resend request', async () => {
    const order: string[] = []
    await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({ order })
    )
    expect(order.indexOf('loadProfile')).toBeGreaterThan(
      order.indexOf('insertAudit')
    )
    expect(order.indexOf('fetch')).toBeGreaterThan(order.indexOf('loadProfile'))
    expect(eventKeyFor('application_submitted', 1)).toBe(
      'application_submitted:1'
    )
  })

  it('stores a documented 202 as event_accepted without an email id', async () => {
    const transitions: EmailAttempt[] = []
    const response = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({ transitions })
    )
    expect(await response.json()).toEqual({ ok: true, result: 'event_accepted' })
    expect(transitions.at(-1)).toMatchObject({
      processingState: 'event_accepted',
      deliveryStatus: 'unconfirmed',
      errorMessage: null,
      resendEmailId: null,
      nextAttemptAt: null,
      providerEvent: { category: 'event_accepted' },
    })
  })

  it('stores a non-202 or network failure as event_submission_unknown and does not send again', async () => {
    const four: EmailAttempt[] = []
    const fourCalls: RecordedRequest[] = []
    const fourDeps = createDeps({
      transitions: four,
      calls: fourCalls,
      fetchImpl: async () =>
        new Response(JSON.stringify({ secret: 'do-not-store' }), {
          status: 429,
        }),
    })
    await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      fourDeps
    )
    expect(four.at(-1)).toMatchObject({
      processingState: 'event_submission_unknown',
      deliveryStatus: 'unconfirmed',
      errorMessage: 'event_submission_unknown',
      resendEmailId: null,
      nextAttemptAt: null,
    })
    expect(JSON.stringify(four.at(-1))).not.toContain('do-not-store')
    const eventPosts = () =>
      fourCalls.filter((call) => call.url === RESEND_EVENTS_URL)
    expect(eventPosts()).toHaveLength(1)
    const retry = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      fourDeps
    )
    expect(await retry.json()).toEqual({ ok: true, result: 'duplicate' })
    expect(eventPosts()).toHaveLength(1)

    const net: EmailAttempt[] = []
    await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({
        transitions: net,
        fetchImpl: async () => {
          throw new Error('connect ECONNREFUSED')
        },
      })
    )
    expect(net.at(-1)).toMatchObject({
      processingState: 'event_submission_unknown',
      deliveryStatus: 'unconfirmed',
      errorMessage: 'event_submission_unknown',
      resendEmailId: null,
    })
    expect(JSON.stringify(net.at(-1))).not.toContain('ECONNREFUSED')
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
    expect(await response.json()).toEqual({ ok: true, result: 'event_accepted' })
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
          return acceptedEventResponse()
        },
      })
    )
    expect(await response.json()).toEqual({ ok: true, result: 'event_accepted' })
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
      expect(order).toEqual(['insertAudit'])
      expect(order).not.toContain('fetch')
      expect(order).not.toContain('loadProfile')
    }
  })

  it('keeps the webhook event key when the reloaded profile version differs', async () => {
    const olderProfile = createMemoryAuditLease()
    const olderCalls: RecordedRequest[] = []
    const older = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({ application_submission_version: 2 })),
      createDeps({
        audit: olderProfile,
        calls: olderCalls,
        profile: loadedProfile(),
      })
    )
    expect(await older.json()).toEqual({ ok: true, result: 'obsolete' })
    expect(olderCalls.some((call) => call.url === RESEND_EVENTS_URL)).toBe(false)
    const olderRows = (olderProfile as AuditLease & { rows: EmailAttempt[] }).rows
    expect(olderRows).toHaveLength(1)
    expect(olderRows[0]).toMatchObject({
      eventKey: 'application_resubmitted:2',
      submissionVersion: 2,
      processingState: 'obsolete',
    })

    const newerProfile = createMemoryAuditLease()
    const newerCalls: RecordedRequest[] = []
    const newer = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({ application_submission_version: 1 })),
      createDeps({
        audit: newerProfile,
        calls: newerCalls,
        profile: loadedProfile({ application_submission_version: 2 }),
      })
    )
    expect(await newer.json()).toEqual({ ok: true, result: 'obsolete' })
    expect(newerCalls.some((call) => call.url === RESEND_EVENTS_URL)).toBe(false)
    const newerRows = (newerProfile as AuditLease & { rows: EmailAttempt[] }).rows
    expect(newerRows).toHaveLength(1)
    expect(newerRows[0]).toMatchObject({
      eventKey: 'application_submitted:1',
      submissionVersion: 1,
      processingState: 'obsolete',
    })
    expect(newerRows.some((row) => row.eventKey.includes(':2'))).toBe(false)
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

  it('claims queued then marks event_accepted on a documented 202', async () => {
    const claimCalls: AuditClaim[] = []
    const transitions: EmailAttempt[] = []
    await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({ claimCalls, transitions })
    )
    expect(claimCalls[0]?.deliveryStatus).toBe('queued')
    expect(transitions.at(-1)?.processingState).toBe('event_accepted')
    expect(transitions.at(-1)?.deliveryStatus).toBe('unconfirmed')
    expect(transitions.at(-1)?.resendEmailId).toBeNull()
  })

  it('moves a non-202 event response to event_submission_unknown', async () => {
    const claimCalls: AuditClaim[] = []
    const transitions: EmailAttempt[] = []
    await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({
        claimCalls,
        transitions,
        fetchImpl: async () => new Response('nope', { status: 500 }),
      })
    )
    expect(claimCalls[0]?.deliveryStatus).toBe('queued')
    expect(transitions.at(-1)).toMatchObject({
      processingState: 'event_submission_unknown',
      deliveryStatus: 'unconfirmed',
      errorMessage: 'event_submission_unknown',
      resendEmailId: null,
      nextAttemptAt: null,
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
      expect(order).not.toContain('insertAudit')
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

  it('updates an existing contact with first_name only and leaves subscription unchanged', async () => {
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
    expect(await response.json()).toEqual({ ok: true, result: 'event_accepted' })
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      `GET ${RESEND_CONTACTS_URL}/${encodeURIComponent(FETCHED_EMAIL)}`,
      `PATCH ${RESEND_CONTACTS_URL}/${encodeURIComponent(FETCHED_EMAIL)}`,
      `POST ${RESEND_EVENTS_URL}`,
    ])
    expect(calls[1]?.body).toEqual({ first_name: EXPLICIT_FIRST_NAME })
    expect(Object.keys(calls[1]?.body as object)).toEqual(['first_name'])
    expect(calls[1]?.body).not.toHaveProperty('unsubscribed')
    expect(JSON.stringify(calls[1]?.body)).not.toContain(FETCHED_NAME)
    expect(calls[2]?.body).toEqual({
      event: 'application_approved',
      email: FETCHED_EMAIL,
    })
  })

  it('creates a missing contact explicitly unsubscribed, with email and first_name', async () => {
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
    expect(await response.json()).toEqual({ ok: true, result: 'event_accepted' })
    const create = calls.find(
      (call) => call.method === 'POST' && call.url === RESEND_CONTACTS_URL
    )
    expect(create?.body).toEqual({
      email: FETCHED_EMAIL,
      first_name: EXPLICIT_FIRST_NAME,
      unsubscribed: true,
    })
    expect(Object.keys(create?.body as object).sort()).toEqual([
      'email',
      'first_name',
      'unsubscribed',
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
    expect(await response.json()).toEqual({ ok: true, result: 'event_accepted' })
    const writes = calls.filter((call) => call.method !== 'GET')
    expect(writes.map((call) => call.body)).toEqual([
      {
        email: FETCHED_EMAIL,
        first_name: EXPLICIT_FIRST_NAME,
        unsubscribed: true,
      },
      { first_name: EXPLICIT_FIRST_NAME },
      { event: 'application_submitted', email: FETCHED_EMAIL },
    ])
    expect(writes[1]?.body).not.toHaveProperty('unsubscribed')
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
    expect(await response.json()).toEqual({ ok: true, result: 'event_accepted' })
    const creates = calls.filter(
      (call) => call.method === 'POST' && call.url === RESEND_CONTACTS_URL
    )
    expect(creates).toHaveLength(2)
    for (const create of creates) {
      expect(create.body).toEqual({
        email: FETCHED_EMAIL,
        first_name: EXPLICIT_FIRST_NAME,
        unsubscribed: true,
      })
    }
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
    const create = calls.find(
      (call) => call.method === 'POST' && call.url === RESEND_CONTACTS_URL
    )
    const patch = calls.find((call) => call.method === 'PATCH')
    expect(create?.body).toEqual({
      email: FETCHED_EMAIL,
      first_name: EXPLICIT_FIRST_NAME,
      unsubscribed: true,
    })
    expect(patch?.body).toEqual({ first_name: EXPLICIT_FIRST_NAME })
    expect(patch?.body).not.toHaveProperty('unsubscribed')
    expect(calls.at(-1)?.url).toBe(RESEND_EVENTS_URL)
  })

  it('does not send the status event when contact sync fails', async () => {
    const calls: RecordedRequest[] = []
    const transitions: EmailAttempt[] = []
    const deps = createDeps({
      calls,
      transitions,
      contactFetch: () =>
        jsonResponse({ name: 'application_error', message: FETCHED_EMAIL }, 500),
    })
    const response = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      deps
    )
    expect(await response.json()).toEqual({
      ok: false,
      error: 'failed',
      result: CONTACT_SYNC_FAILED,
    })
    expect(calls.some((call) => call.url === RESEND_EVENTS_URL)).toBe(false)
    expect(transitions.at(-1)).toMatchObject({
      processingState: CONTACT_SYNC_FAILED,
      deliveryStatus: 'queued',
      errorMessage: CONTACT_SYNC_FAILED,
      resendEmailId: null,
      providerEvent: { category: CONTACT_SYNC_FAILED },
    })
    expect(transitions.at(-1)?.nextAttemptAt).not.toBeNull()
    expect(JSON.stringify(transitions.at(-1)?.providerEvent)).not.toContain(
      FETCHED_EMAIL
    )
    expect(JSON.stringify(transitions.at(-1)?.errorMessage)).not.toContain(
      FETCHED_EMAIL
    )
    expect(JSON.stringify(transitions.at(-1)?.providerEvent)).not.toContain(
      EXPLICIT_FIRST_NAME
    )

    const retryOrder: string[] = []
    const retry = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      { ...deps, log: (message) => retryOrder.push(message) }
    )
    expect(await retry.json()).toEqual({ ok: true, result: 'not_acquired' })
    expect(retryOrder).toEqual(['not_acquired'])
    expect(calls.some((call) => call.url === RESEND_EVENTS_URL)).toBe(false)
  })

  it('does not invent a contact name when the explicit first name is missing or blank', async () => {
    for (const draft of [
      { profile: { firstName: '', displayName: FETCHED_NAME } },
      { profile: { firstName: '   ', displayName: FETCHED_NAME } },
      null,
    ]) {
      const calls: RecordedRequest[] = []
      const transitions: EmailAttempt[] = []
      const response = await handleApplicationStatusEmailRequest(
        jsonRequest(webhookPayload({})),
        createDeps({
          calls,
          transitions,
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
      expect(transitions.at(-1)?.processingState).toBe(MISSING_FIRST_NAME)
      expect(transitions.at(-1)?.errorMessage).toBe(MISSING_FIRST_NAME)
      expect(transitions.at(-1)?.nextAttemptAt).not.toBeNull()
      expect(JSON.stringify(transitions.at(-1))).not.toContain(FETCHED_NAME)
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
    expect(await response.json()).toEqual({ ok: true, result: 'event_accepted' })
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

  it('does not send subscription, segment, topic, or suppression fields when updating an existing contact', async () => {
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

describe('application status email recovery', () => {
  const ROW_A = '44444444-4444-4444-8444-444444444444'
  const ROW_B = '55555555-5555-4555-8555-555555555555'
  const APP_B = '33333333-3333-4333-8333-333333333333'
  const START = Date.parse('2026-10-07T17:00:00.000Z')

  function dueRow(
    overrides: Partial<EmailAttempt> & Pick<EmailAttempt, 'id' | 'eventKey'>
  ): EmailAttempt {
    return {
      applicationId: PROFILE_ID,
      recipientEmail: FETCHED_EMAIL,
      applicationStatus: 'submitted',
      resendEventName: 'application_submitted',
      submissionVersion: 1,
      processingState: 'contact_sync_pending',
      claimToken: null,
      claimedUntil: null,
      attemptCount: 0,
      nextAttemptAt: new Date(START - 1000).toISOString(),
      deliveryStatus: 'queued',
      errorMessage: null,
      resendEmailId: null,
      providerEvent: {},
      ...overrides,
    }
  }

  function retryRequest() {
    return new Request('http://function.local/application-status-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [RETRY_SECRET_HEADER]: RETRY_SECRET,
      },
      body: JSON.stringify({ mode: 'retry' }),
    })
  }

  it('uses the same bounded backoff for a missing first name and a failed sync', () => {
    const now = START
    expect(retryNextAttemptAt(now, 1)).toBe(new Date(now + 60_000).toISOString())
    expect(retryNextAttemptAt(now, 2)).toBe(new Date(now + 120_000).toISOString())
    expect(retryNextAttemptAt(now, 5)).toBeNull()
  })

  it('never acquires an exhausted row or a future-scheduled row', async () => {
    const audit = createMemoryAuditLease(() => new Date(START))
    seedEmailAttempt(
      audit,
      dueRow({
        id: ROW_A,
        eventKey: 'application_submitted:1',
        processingState: 'contact_sync_failed',
        attemptCount: 5,
        nextAttemptAt: null,
        errorMessage: CONTACT_SYNC_FAILED,
      })
    )
    seedEmailAttempt(
      audit,
      dueRow({
        id: ROW_B,
        applicationId: APP_B,
        eventKey: 'application_submitted:1',
        nextAttemptAt: new Date(START + 60_000).toISOString(),
      })
    )
    expect(await audit.acquireById(ROW_A, 30)).toBeNull()
    expect(await audit.acquireById(ROW_B, 30)).toBeNull()
    expect(await audit.acquireNext(30)).toBeNull()

    const calls: RecordedRequest[] = []
    const response = await handleApplicationStatusEmailRequest(
      retryRequest(),
      createDeps({ audit, calls })
    )
    expect(await response.json()).toEqual({ ok: true, result: 'retry_batch' })
    expect(calls.some((call) => call.url === RESEND_EVENTS_URL)).toBe(false)
    expect(calls.some((call) => call.url.startsWith(RESEND_CONTACTS_URL))).toBe(
      false
    )
  })

  it('transitions a due failed row back to pending and then accepts the event', async () => {
    let nowMs = START
    const audit = createMemoryAuditLease(() => new Date(nowMs))
    let contactAttempts = 0
    const transitions: EmailAttempt[] = []
    const deps = createDeps({
      audit,
      transitions,
      contactFetch: () => {
        contactAttempts += 1
        if (contactAttempts === 1) {
          return jsonResponse({ name: 'application_error' }, 500)
        }
        if (contactAttempts === 2) {
          return jsonResponse({ name: 'not_found' }, 404)
        }
        return jsonResponse({ object: 'contact', id: 'con_1' }, 201)
      },
    })

    const failed = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      deps
    )
    expect(await failed.json()).toMatchObject({ result: CONTACT_SYNC_FAILED })
    expect(transitions.at(-1)?.processingState).toBe('contact_sync_failed')
    expect(transitions.at(-1)?.attemptCount).toBe(1)
    expect(transitions.at(-1)?.nextAttemptAt).toBe(
      new Date(START + 60_000).toISOString()
    )

    nowMs = START + 60_000
    const retried = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      deps
    )
    expect(await retried.json()).toEqual({ ok: true, result: 'event_accepted' })
    expect(
      transitions.some(
        (row) =>
          row.processingState === 'contact_sync_pending' && row.attemptCount === 2
      )
    ).toBe(true)
    expect(transitions.at(-1)?.attemptCount).toBe(2)
    expect(transitions.at(-1)?.processingState).toBe('event_accepted')
  })

  it('transitions a due missing-name row back to pending before contact sync', async () => {
    const audit = createMemoryAuditLease(() => new Date(START))
    seedEmailAttempt(
      audit,
      dueRow({
        id: ROW_A,
        eventKey: 'application_approved:1',
        applicationStatus: 'approved',
        resendEventName: 'application_approved',
        processingState: 'missing_first_name',
        attemptCount: 2,
        nextAttemptAt: new Date(START - 1000).toISOString(),
        errorMessage: MISSING_FIRST_NAME,
      })
    )
    const transitions: EmailAttempt[] = []
    const response = await handleApplicationStatusEmailRequest(
      retryRequest(),
      createDeps({
        audit,
        transitions,
        profile: loadedProfile({
          application_status: 'approved',
          application_draft: draftWithFirstName(EXPLICIT_FIRST_NAME),
        }),
      })
    )
    expect(await response.json()).toEqual({ ok: true, result: 'retry_batch' })
    expect(
      transitions.some((row) => row.processingState === 'contact_sync_pending')
    ).toBe(true)
    expect(transitions.at(-1)).toMatchObject({
      processingState: 'event_accepted',
      deliveryStatus: 'unconfirmed',
      resendEmailId: null,
      nextAttemptAt: null,
    })
  })

  it('does not post a later batch item under an expired lease', async () => {
    const audit = createMemoryAuditLease(() => new Date(START))
    seedEmailAttempt(
      audit,
      dueRow({
        id: ROW_A,
        eventKey: 'application_submitted:1',
        recipientEmail: 'first@example.com',
        nextAttemptAt: new Date(START - 2000).toISOString(),
      })
    )
    seedEmailAttempt(
      audit,
      dueRow({
        id: ROW_B,
        applicationId: APP_B,
        eventKey: 'application_submitted:1',
        recipientEmail: 'second@example.com',
        nextAttemptAt: new Date(START - 1000).toISOString(),
      })
    )
    let confirmations = 0
    const calls: RecordedRequest[] = []
    await handleApplicationStatusEmailRequest(
      retryRequest(),
      createDeps({
        audit,
        calls,
        beforeEventConfirmation: async () => {
          confirmations += 1
          if (confirmations === 1) audit.expireLeases()
        },
      })
    )
    const events = calls.filter((call) => call.url === RESEND_EVENTS_URL)
    expect(events).toHaveLength(1)
    expect(events[0]?.body).toEqual({
      event: 'application_submitted',
      email: FETCHED_EMAIL,
    })
    const rows = (audit as AuditLease & { rows: EmailAttempt[] }).rows
    expect(rows.find((row) => row.id === ROW_A)?.processingState).toBe(
      'event_submitting'
    )
    expect(rows.find((row) => row.id === ROW_B)?.processingState).toBe(
      'event_accepted'
    )
  })

  it('stops obsolete and version-mismatched events on the webhook and the worker', async () => {
    const versionCalls: RecordedRequest[] = []
    const versionMismatch = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({ application_submission_version: 1 })),
      createDeps({
        calls: versionCalls,
        profile: loadedProfile({ application_submission_version: 2 }),
      })
    )
    expect(await versionMismatch.json()).toEqual({ ok: true, result: 'obsolete' })
    expect(versionCalls.some((call) => call.url === RESEND_EVENTS_URL)).toBe(
      false
    )

    const obsoleteCalls: RecordedRequest[] = []
    const obsolete = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({
        calls: obsoleteCalls,
        profile: loadedProfile({ application_status: 'archived' }),
      })
    )
    expect(await obsolete.json()).toEqual({ ok: true, result: 'obsolete' })
    expect(obsoleteCalls).toHaveLength(0)

    const changedBeforeSend: RecordedRequest[] = []
    const recheck = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({
        calls: changedBeforeSend,
        profiles: [
          loadedProfile(),
          loadedProfile({ application_submission_version: 2 }),
        ],
      })
    )
    expect(await recheck.json()).toEqual({ ok: true, result: 'obsolete' })
    expect(changedBeforeSend.some((call) => call.url === RESEND_EVENTS_URL)).toBe(
      false
    )

    const audit = createMemoryAuditLease(() => new Date(START))
    seedEmailAttempt(
      audit,
      dueRow({
        id: ROW_A,
        eventKey: 'application_submitted:1',
        submissionVersion: 1,
      })
    )
    seedEmailAttempt(
      audit,
      dueRow({
        id: ROW_B,
        applicationId: APP_B,
        eventKey: 'application_approved:1',
        applicationStatus: 'approved',
        resendEventName: 'application_approved',
        submissionVersion: 1,
      })
    )
    const workerCalls: RecordedRequest[] = []
    let loads = 0
    const worker = createDeps({ audit, calls: workerCalls })
    worker.loadProfile = async () => {
      loads += 1
      if (loads === 1) {
        return {
          status: 'found',
          profile: loadedProfile({ application_submission_version: 2 }),
        }
      }
      return {
        status: 'found',
        profile: loadedProfile({ application_status: 'rejected' }),
      }
    }
    const batch = await handleApplicationStatusEmailRequest(retryRequest(), worker)
    expect(await batch.json()).toEqual({ ok: true, result: 'retry_batch' })
    expect(workerCalls.some((call) => call.url === RESEND_EVENTS_URL)).toBe(false)
    const rows = (audit as AuditLease & { rows: EmailAttempt[] }).rows
    expect(rows.every((row) => row.processingState === 'obsolete')).toBe(true)
    expect(rows.every((row) => row.nextAttemptAt == null)).toBe(true)
  })

  it('stores a missing Resend key for later recovery without a provider call', async () => {
    let nowMs = START
    const audit = createMemoryAuditLease(() => new Date(nowMs))
    const calls: RecordedRequest[] = []
    const logs: string[] = []
    const missingKey = createDeps({
      audit,
      calls,
      logs,
      env: { RESEND_API_KEY: '' },
    })

    const response = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      missingKey
    )
    const body = await response.json()
    expect(body).toEqual({
      ok: false,
      error: 'failed',
      result: CONTACT_SYNC_FAILED,
    })
    expect(calls).toHaveLength(0)
    const rows = () => (audit as AuditLease & { rows: EmailAttempt[] }).rows
    expect(rows()).toHaveLength(1)
    const scheduled = rows()[0]
    expect(scheduled).toMatchObject({
      processingState: CONTACT_SYNC_FAILED,
      attemptCount: 1,
      nextAttemptAt: new Date(START + 60_000).toISOString(),
      claimToken: null,
      resendEmailId: null,
    })
    expect(scheduled?.processingState).not.toBe('event_submitting')
    const publicText = `${JSON.stringify(body)}\n${logs.join('\n')}\n${scheduled?.errorMessage}`
    expect(publicText).not.toContain(FETCHED_EMAIL)
    expect(publicText).not.toContain(EXPLICIT_FIRST_NAME)
    expect(publicText).not.toContain(WEBHOOK_SECRET)
    expect(publicText).not.toContain(RESEND_KEY)

    const duplicate = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      missingKey
    )
    expect(await duplicate.json()).toEqual({ ok: true, result: 'not_acquired' })
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toMatchObject({
      id: scheduled?.id,
      attemptCount: 1,
      nextAttemptAt: scheduled?.nextAttemptAt,
      processingState: CONTACT_SYNC_FAILED,
    })
    expect(calls).toHaveLength(0)

    nowMs = START + 60_000
    const recoveredCalls: RecordedRequest[] = []
    const recovered = await handleApplicationStatusEmailRequest(
      retryRequest(),
      createDeps({
        audit,
        calls: recoveredCalls,
        env: { RESEND_API_KEY: RESEND_KEY },
      })
    )
    expect(await recovered.json()).toEqual({ ok: true, result: 'retry_batch' })
    const events = recoveredCalls.filter((call) => call.url === RESEND_EVENTS_URL)
    expect(events).toHaveLength(1)
    expect(events[0]?.body).toEqual({
      event: 'application_submitted',
      email: FETCHED_EMAIL,
    })
    expect(rows()[0]).toMatchObject({
      id: scheduled?.id,
      processingState: 'event_accepted',
      deliveryStatus: 'unconfirmed',
      resendEmailId: null,
      attemptCount: 2,
    })

    const again = await handleApplicationStatusEmailRequest(
      retryRequest(),
      createDeps({
        audit,
        calls: recoveredCalls,
        env: { RESEND_API_KEY: RESEND_KEY },
      })
    )
    expect(await again.json()).toEqual({ ok: true, result: 'retry_batch' })
    expect(recoveredCalls.filter((call) => call.url === RESEND_EVENTS_URL)).toHaveLength(1)
  })

  it('does not create a recovery row for an invalid or unauthenticated request', async () => {
    const cases: Array<{ request: Request; status: number }> = [
      {
        request: jsonRequest(webhookPayload({}), { secret: null }),
        status: 401,
      },
      {
        request: jsonRequest(webhookPayload({}), { secret: 'wrong-secret' }),
        status: 401,
      },
      {
        request: new Request('http://function.local/application-status-email', {
          method: 'POST',
          headers: { [WEBHOOK_SECRET_HEADER]: WEBHOOK_SECRET },
          body: '{',
        }),
        status: 200,
      },
      {
        request: jsonRequest(
          webhookPayload({ previousStatus: 'submitted', nextStatus: 'submitted' })
        ),
        status: 200,
      },
    ]

    for (const row of cases) {
      const audit = createMemoryAuditLease(() => new Date(START))
      const calls: RecordedRequest[] = []
      const response = await handleApplicationStatusEmailRequest(
        row.request,
        createDeps({
          audit,
          calls,
          env: { RESEND_API_KEY: '' },
          profile: loadedProfile(),
        })
      )
      expect(response.status).toBe(row.status)
      expect((audit as AuditLease & { rows: EmailAttempt[] }).rows).toHaveLength(0)
      expect(calls).toHaveLength(0)
    }
  })

  it('does not acquire an exhausted missing-key row or reset its attempt cap', async () => {
    const audit = createMemoryAuditLease(() => new Date(START))
    seedEmailAttempt(
      audit,
      dueRow({
        id: ROW_A,
        eventKey: 'application_submitted:1',
        processingState: 'contact_sync_failed',
        attemptCount: 5,
        nextAttemptAt: null,
        errorMessage: CONTACT_SYNC_FAILED,
      })
    )
    const calls: RecordedRequest[] = []
    const deps = createDeps({
      audit,
      calls,
      env: { RESEND_API_KEY: '' },
    })
    const webhook = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      deps
    )
    expect(await webhook.json()).toEqual({ ok: true, result: 'not_acquired' })
    const worker = await handleApplicationStatusEmailRequest(retryRequest(), deps)
    expect(await worker.json()).toEqual({ ok: true, result: 'retry_batch' })
    const rows = (audit as AuditLease & { rows: EmailAttempt[] }).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: ROW_A,
      processingState: CONTACT_SYNC_FAILED,
      attemptCount: 5,
      nextAttemptAt: null,
    })
    expect(calls).toHaveLength(0)
    expect(await audit.acquireById(ROW_A, 30)).toBeNull()
    expect(await audit.acquireNext(30)).toBeNull()
  })

  it('schedules a retry when a profile reload fails and does not call Resend', async () => {
    const calls: RecordedRequest[] = []
    const logs: string[] = []
    const audit = createMemoryAuditLease(() => new Date(START))
    const response = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({
        audit,
        calls,
        logs,
        profiles: ['error'],
      })
    )
    expect(await response.json()).toEqual({
      ok: false,
      error: 'failed',
      result: CONTACT_SYNC_FAILED,
    })
    expect(logs).toContain('profile_load_failed')
    expect(logs).not.toContain('obsolete')
    const rows = (audit as AuditLease & { rows: EmailAttempt[] }).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      processingState: CONTACT_SYNC_FAILED,
      errorMessage: 'profile_load_failed',
      attemptCount: 1,
      nextAttemptAt: new Date(START + 60_000).toISOString(),
    })
    expect(calls.some((call) => call.url.startsWith('https://api.resend.com'))).toBe(
      false
    )

    const workerCalls: RecordedRequest[] = []
    const workerAudit = createMemoryAuditLease(() => new Date(START))
    seedEmailAttempt(
      workerAudit,
      dueRow({ id: ROW_A, eventKey: 'application_submitted:1' })
    )
    const worker = await handleApplicationStatusEmailRequest(
      retryRequest(),
      createDeps({
        audit: workerAudit,
        calls: workerCalls,
        profile: 'error',
      })
    )
    expect(await worker.json()).toEqual({ ok: true, result: 'retry_batch' })
    const workerRows = (workerAudit as AuditLease & { rows: EmailAttempt[] }).rows
    expect(workerRows[0]).toMatchObject({
      processingState: CONTACT_SYNC_FAILED,
      errorMessage: 'profile_load_failed',
      attemptCount: 1,
      nextAttemptAt: new Date(START + 60_000).toISOString(),
    })
    expect(
      workerCalls.some((call) => call.url.startsWith('https://api.resend.com'))
    ).toBe(false)
  })

  it('recovers one event after the initial profile load fails', async () => {
    let nowMs = START
    const audit = createMemoryAuditLease(() => new Date(nowMs))
    const calls: RecordedRequest[] = []
    const failed = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({
        audit,
        calls,
        profiles: ['error', loadedProfile(), loadedProfile()],
      })
    )
    expect(failed.status).toBe(200)
    expect(await failed.json()).toEqual({
      ok: false,
      error: 'failed',
      result: CONTACT_SYNC_FAILED,
    })
    const rows = () => (audit as AuditLease & { rows: EmailAttempt[] }).rows
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toMatchObject({
      applicationId: PROFILE_ID,
      eventKey: 'application_submitted:1',
      submissionVersion: 1,
      resendEventName: 'application_submitted',
      recipientEmail: null,
      processingState: CONTACT_SYNC_FAILED,
      errorMessage: 'profile_load_failed',
      attemptCount: 1,
      nextAttemptAt: new Date(START + 60_000).toISOString(),
    })
    expect(rows()[0]?.recipientEmail).not.toBe(WEBHOOK_EMAIL)
    expect(calls.some((call) => call.url.startsWith('https://api.resend.com'))).toBe(
      false
    )

    nowMs = START + 60_000
    const recovered = await handleApplicationStatusEmailRequest(
      retryRequest(),
      createDeps({ audit, calls })
    )
    expect(await recovered.json()).toEqual({ ok: true, result: 'retry_batch' })
    const events = calls.filter((call) => call.url === RESEND_EVENTS_URL)
    expect(events).toHaveLength(1)
    expect(events[0]?.body).toEqual({
      event: 'application_submitted',
      email: FETCHED_EMAIL,
    })
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toMatchObject({
      eventKey: 'application_submitted:1',
      submissionVersion: 1,
      recipientEmail: FETCHED_EMAIL,
      processingState: 'event_accepted',
      attemptCount: 2,
    })

    await handleApplicationStatusEmailRequest(
      retryRequest(),
      createDeps({ audit, calls })
    )
    expect(calls.filter((call) => call.url === RESEND_EVENTS_URL)).toHaveLength(1)
    expect(rows()).toHaveLength(1)
  })

  it('marks a definitively absent or superseded profile obsolete', async () => {
    const absentCalls: RecordedRequest[] = []
    const absentAudit = createMemoryAuditLease(() => new Date(START))
    const absentWebhook = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({ audit: absentAudit, calls: absentCalls, profile: null })
    )
    expect(await absentWebhook.json()).toEqual({ ok: true, result: 'obsolete' })
    expect((absentAudit as AuditLease & { rows: EmailAttempt[] }).rows).toMatchObject([
      {
        eventKey: 'application_submitted:1',
        submissionVersion: 1,
        processingState: 'obsolete',
        recipientEmail: null,
      },
    ])
    expect(absentCalls).toHaveLength(0)

    const ownedAbsent = createMemoryAuditLease(() => new Date(START))
    seedEmailAttempt(
      ownedAbsent,
      dueRow({ id: ROW_A, eventKey: 'application_submitted:1' })
    )
    const ownedCalls: RecordedRequest[] = []
    await handleApplicationStatusEmailRequest(
      retryRequest(),
      createDeps({ audit: ownedAbsent, calls: ownedCalls, profile: null })
    )
    expect(
      (ownedAbsent as AuditLease & { rows: EmailAttempt[] }).rows[0]
    ).toMatchObject({
      processingState: 'obsolete',
      nextAttemptAt: null,
      attemptCount: 1,
    })
    expect(ownedCalls).toHaveLength(0)

    const superseded = createMemoryAuditLease(() => new Date(START))
    seedEmailAttempt(
      superseded,
      dueRow({ id: ROW_B, eventKey: 'application_submitted:1' })
    )
    await handleApplicationStatusEmailRequest(
      retryRequest(),
      createDeps({
        audit: superseded,
        profile: loadedProfile({ application_status: 'rejected' }),
      })
    )
    expect(
      (superseded as AuditLease & { rows: EmailAttempt[] }).rows[0]
    ).toMatchObject({
      processingState: 'obsolete',
      nextAttemptAt: null,
    })
  })

  function tightenPreSendLease(audit: AuditLease, budgetMs: number) {
    const until = new Date(
      Date.now() + PRE_SEND_PERSIST_MARGIN_MS + budgetMs
    ).toISOString()
    const apply = (row: EmailAttempt | null) => {
      if (!row) return row
      row.claimedUntil = until
      const stored = (audit as AuditLease & { rows: EmailAttempt[] }).rows.find(
        (item) => item.id === row.id
      )
      if (stored) stored.claimedUntil = until
      return row
    }
    const acquireById = audit.acquireById.bind(audit)
    const acquireNext = audit.acquireNext.bind(audit)
    audit.acquireById = async (id, seconds) => apply(await acquireById(id, seconds))
    audit.acquireNext = async (seconds) => apply(await acquireNext(seconds))
  }

  it('stops a hanging contact body inside the pre-send budget', async () => {
    const audit = createMemoryAuditLease()
    seedEmailAttempt(
      audit,
      dueRow({
        id: ROW_A,
        eventKey: 'application_submitted:1',
        nextAttemptAt: new Date(Date.now() - 1000).toISOString(),
      })
    )
    tightenPreSendLease(audit, 300)
    let rejectPull: (error: unknown) => void = () => undefined
    const calls: RecordedRequest[] = []
    const started = Date.now()
    const response = await handleApplicationStatusEmailRequest(
      retryRequest(),
      createDeps({
        audit,
        calls,
        contactFetch: () => {
          const stream = new ReadableStream({
            pull() {
              return new Promise((_resolve, reject) => {
                rejectPull = reject
              })
            },
            cancel() {
              rejectPull(new DOMException('The operation was aborted.', 'AbortError'))
            },
          })
          return new Response(stream, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        },
      })
    )
    expect(Date.now() - started).toBeLessThan(2_000)
    expect(await response.json()).toEqual({ ok: true, result: 'retry_batch' })
    const rows = (audit as AuditLease & { rows: EmailAttempt[] }).rows
    expect(rows[0]).toMatchObject({
      processingState: CONTACT_SYNC_FAILED,
      attemptCount: 1,
    })
    expect(rows[0]?.nextAttemptAt).not.toBeNull()
    expect(calls.some((call) => call.url === RESEND_EVENTS_URL)).toBe(false)
  })

  it('stops a contact call that never returns headers inside the pre-send budget', async () => {
    const audit = createMemoryAuditLease()
    seedEmailAttempt(
      audit,
      dueRow({
        id: ROW_A,
        eventKey: 'application_submitted:1',
        nextAttemptAt: new Date(Date.now() - 1000).toISOString(),
      })
    )
    tightenPreSendLease(audit, 300)
    const started = Date.now()
    const calls: RecordedRequest[] = []
    const response = await handleApplicationStatusEmailRequest(
      retryRequest(),
      createDeps({
        audit,
        calls,
        contactFetch: () => new Promise(() => undefined),
      })
    )
    expect(Date.now() - started).toBeLessThan(2_000)
    expect(await response.json()).toEqual({ ok: true, result: 'retry_batch' })
    expect(
      (audit as AuditLease & { rows: EmailAttempt[] }).rows[0]
    ).toMatchObject({
      processingState: CONTACT_SYNC_FAILED,
      attemptCount: 1,
    })
    expect(calls.some((call) => call.url === RESEND_EVENTS_URL)).toBe(false)
  })

  it('counts lease expiry toward the five-attempt cap and fences stale owners', async () => {
    const audit = createMemoryAuditLease(() => new Date(START))
    seedEmailAttempt(
      audit,
      dueRow({ id: ROW_A, eventKey: 'application_submitted:1' })
    )
    const rows = () => (audit as AuditLease & { rows: EmailAttempt[] }).rows
    let previousToken: string | null = null
    for (let expected = 1; expected <= 5; expected += 1) {
      const leased = await audit.acquireById(ROW_A, 30)
      expect(leased?.attemptCount).toBe(expected)
      if (expected < 5) expect(leased?.nextAttemptAt).not.toBeNull()
      else expect(leased?.nextAttemptAt).toBeNull()
      previousToken = leased?.claimToken ?? null
      audit.expireLeases()
    }
    expect(await audit.acquireById(ROW_A, 30)).toBeNull()
    expect(await audit.acquireNext(30)).toBeNull()
    expect(rows()[0]).toMatchObject({
      attemptCount: 5,
      nextAttemptAt: null,
      processingState: 'contact_sync_pending',
    })

    const stale = await audit.transition({
      id: ROW_A,
      claimToken: previousToken ?? '',
      expectedState: 'contact_sync_pending',
      nextState: 'contact_sync_failed',
      attemptCount: 1,
      nextAttemptAt: new Date(START).toISOString(),
      errorMessage: CONTACT_SYNC_FAILED,
      deliveryStatus: 'queued',
      resendEmailId: null,
      providerEvent: { category: CONTACT_SYNC_FAILED },
      leaseSeconds: null,
      clearLease: true,
    })
    expect(stale).toBeNull()
    expect(rows()[0]?.attemptCount).toBe(5)

    const fresh = createMemoryAuditLease(() => new Date(START))
    seedEmailAttempt(
      fresh,
      dueRow({ id: ROW_B, eventKey: 'application_submitted:1', attemptCount: 0 })
    )
    const owner = await fresh.acquireById(ROW_B, 30)
    expect(owner?.attemptCount).toBe(1)
    const rewritten = await fresh.transition({
      id: ROW_B,
      claimToken: owner?.claimToken ?? '',
      expectedState: 'contact_sync_pending',
      nextState: 'contact_sync_failed',
      attemptCount: 2,
      nextAttemptAt: null,
      errorMessage: CONTACT_SYNC_FAILED,
      deliveryStatus: 'queued',
      resendEmailId: null,
      providerEvent: { category: CONTACT_SYNC_FAILED },
      leaseSeconds: null,
      clearLease: true,
    })
    expect(rewritten).toBeNull()
    expect((fresh as AuditLease & { rows: EmailAttempt[] }).rows[0]?.attemptCount).toBe(
      1
    )
  })

  const CHANGED_EMAIL = 'later@example.com'

  function eventPosts(calls: RecordedRequest[]) {
    return calls.filter((call) => call.url === RESEND_EVENTS_URL)
  }

  function contactCallsFor(calls: RecordedRequest[], email: string) {
    const encoded = encodeURIComponent(email)
    return calls.filter(
      (call) =>
        call.url.startsWith(RESEND_CONTACTS_URL) && call.url.includes(encoded)
    )
  }

  it('sends the event to the same recipient whose contact name was synced', async () => {
    const calls: RecordedRequest[] = []
    const audit = createMemoryAuditLease(() => new Date(START))
    const response = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({
        audit,
        calls,
        profiles: [loadedProfile(), loadedProfile()],
      })
    )
    expect(await response.json()).toEqual({ ok: true, result: 'event_accepted' })
    const synced = contactCallsFor(calls, FETCHED_EMAIL)
    expect(synced.length).toBeGreaterThan(0)
    expect(contactCallsFor(calls, WEBHOOK_EMAIL)).toHaveLength(0)
    const events = eventPosts(calls)
    expect(events).toHaveLength(1)
    expect(events[0]?.body).toEqual({
      event: 'application_submitted',
      email: FETCHED_EMAIL,
    })
    for (const call of calls) {
      const serialized = JSON.stringify(call.body)
      expect(serialized).not.toContain('unsubscribed')
      expect(serialized).not.toContain('segments')
      expect(serialized).not.toContain('topics')
      expect(serialized).not.toContain('suppression')
    }
    expect(
      (audit as AuditLease & { rows: EmailAttempt[] }).rows[0]?.recipientEmail
    ).toBe(FETCHED_EMAIL)
  })

  it('retries the same row when the recipient changes and then syncs the new address once', async () => {
    let nowMs = START
    const audit = createMemoryAuditLease(() => new Date(nowMs))
    const calls: RecordedRequest[] = []
    const logs: string[] = []
    const changed = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({
        audit,
        calls,
        logs,
        profiles: [loadedProfile(), loadedProfile({ email: CHANGED_EMAIL })],
      })
    )
    expect(await changed.json()).toEqual({
      ok: false,
      error: 'failed',
      result: CONTACT_SYNC_FAILED,
    })
    const rows = () => (audit as AuditLease & { rows: EmailAttempt[] }).rows
    expect(rows()).toHaveLength(1)
    const scheduled = rows()[0]
    expect(scheduled).toMatchObject({
      processingState: CONTACT_SYNC_FAILED,
      errorMessage: 'recipient_changed',
      recipientEmail: FETCHED_EMAIL,
      attemptCount: 1,
      nextAttemptAt: new Date(START + 60_000).toISOString(),
      claimToken: null,
    })
    expect(scheduled?.processingState).not.toBe('obsolete')
    expect(scheduled?.processingState).not.toBe('event_submitting')
    expect(eventPosts(calls)).toHaveLength(0)
    expect(contactCallsFor(calls, FETCHED_EMAIL).length).toBeGreaterThan(0)
    expect(contactCallsFor(calls, CHANGED_EMAIL)).toHaveLength(0)
    expect(logs).toContain('recipient_changed')
    const publicText = `${logs.join('\n')}\n${scheduled?.errorMessage}`
    expect(publicText).not.toContain(FETCHED_EMAIL)
    expect(publicText).not.toContain(CHANGED_EMAIL)

    nowMs = START + 60_000
    const recoveredCalls: RecordedRequest[] = []
    const recovered = await handleApplicationStatusEmailRequest(
      retryRequest(),
      createDeps({
        audit,
        calls: recoveredCalls,
        profiles: [
          loadedProfile({ email: CHANGED_EMAIL }),
          loadedProfile({ email: CHANGED_EMAIL }),
        ],
      })
    )
    expect(await recovered.json()).toEqual({ ok: true, result: 'retry_batch' })
    expect(contactCallsFor(recoveredCalls, CHANGED_EMAIL).length).toBeGreaterThan(0)
    expect(contactCallsFor(recoveredCalls, FETCHED_EMAIL)).toHaveLength(0)
    const events = eventPosts(recoveredCalls)
    expect(events).toHaveLength(1)
    expect(events[0]?.body).toEqual({
      event: 'application_submitted',
      email: CHANGED_EMAIL,
    })
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toMatchObject({
      id: scheduled?.id,
      recipientEmail: CHANGED_EMAIL,
      processingState: 'event_accepted',
      attemptCount: 2,
    })

    const againCalls: RecordedRequest[] = []
    await handleApplicationStatusEmailRequest(
      retryRequest(),
      createDeps({ audit, calls: againCalls })
    )
    expect(eventPosts(againCalls)).toHaveLength(0)
    expect(eventPosts(recoveredCalls)).toHaveLength(1)
  })

  it('stops retrying recipient changes at the five-attempt cap', async () => {
    let nowMs = START
    const audit = createMemoryAuditLease(() => new Date(nowMs))
    const calls: RecordedRequest[] = []
    const deps = createDeps({ audit, calls })
    let loads = 0
    deps.loadProfile = async () => {
      loads += 1
      const email = loads % 2 === 1 ? FETCHED_EMAIL : CHANGED_EMAIL
      return { status: 'found', profile: loadedProfile({ email }) }
    }
    const rows = () => (audit as AuditLease & { rows: EmailAttempt[] }).rows

    const first = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      deps
    )
    expect(await first.json()).toMatchObject({ result: CONTACT_SYNC_FAILED })
    expect(rows()[0]?.attemptCount).toBe(1)

    for (let attempt = 2; attempt <= 5; attempt += 1) {
      const dueAt = rows()[0]?.nextAttemptAt
      expect(dueAt).not.toBeNull()
      nowMs = Date.parse(dueAt ?? '')
      const response = await handleApplicationStatusEmailRequest(retryRequest(), deps)
      expect(await response.json()).toEqual({ ok: true, result: 'retry_batch' })
      expect(rows()[0]).toMatchObject({
        attemptCount: attempt,
        processingState: CONTACT_SYNC_FAILED,
        errorMessage: 'recipient_changed',
        recipientEmail: FETCHED_EMAIL,
      })
    }

    expect(rows()[0]?.nextAttemptAt).toBeNull()
    expect(eventPosts(calls)).toHaveLength(0)
    expect(contactCallsFor(calls, CHANGED_EMAIL)).toHaveLength(0)
    nowMs += 60_000
    const exhausted = await handleApplicationStatusEmailRequest(retryRequest(), deps)
    expect(await exhausted.json()).toEqual({ ok: true, result: 'retry_batch' })
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toMatchObject({
      attemptCount: 5,
      nextAttemptAt: null,
      processingState: CONTACT_SYNC_FAILED,
    })
    expect(eventPosts(calls)).toHaveLength(0)
    expect(await audit.acquireById(rows()[0]?.id ?? '', 30)).toBeNull()
    expect(await audit.acquireNext(30)).toBeNull()
  })

  it('still obsoletes a version or status change without sending', async () => {
    const versionCalls: RecordedRequest[] = []
    const versionAudit = createMemoryAuditLease(() => new Date(START))
    const versionChange = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({
        audit: versionAudit,
        calls: versionCalls,
        profiles: [
          loadedProfile(),
          loadedProfile({
            email: CHANGED_EMAIL,
            application_submission_version: 2,
          }),
        ],
      })
    )
    expect(await versionChange.json()).toEqual({ ok: true, result: 'obsolete' })
    expect(eventPosts(versionCalls)).toHaveLength(0)
    expect(
      (versionAudit as AuditLease & { rows: EmailAttempt[] }).rows[0]
    ).toMatchObject({
      processingState: 'obsolete',
      nextAttemptAt: null,
      recipientEmail: FETCHED_EMAIL,
      eventKey: 'application_submitted:1',
    })

    const statusCalls: RecordedRequest[] = []
    const statusAudit = createMemoryAuditLease(() => new Date(START))
    const statusChange = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({
        audit: statusAudit,
        calls: statusCalls,
        profiles: [
          loadedProfile(),
          loadedProfile({
            email: CHANGED_EMAIL,
            application_status: 'rejected',
          }),
        ],
      })
    )
    expect(await statusChange.json()).toEqual({ ok: true, result: 'obsolete' })
    expect(eventPosts(statusCalls)).toHaveLength(0)
    expect(
      (statusAudit as AuditLease & { rows: EmailAttempt[] }).rows[0]
    ).toMatchObject({
      processingState: 'obsolete',
      nextAttemptAt: null,
      errorMessage: 'obsolete',
    })
  })

  it('does not let a stale owner rewrite the recipient or the retry schedule', async () => {
    const audit = createMemoryAuditLease(() => new Date(START))
    const assignRecipient = audit.assignRecipient.bind(audit)
    let ownerToken: string | null = null
    audit.assignRecipient = async (input) => {
      ownerToken = input.claimToken
      return assignRecipient(input)
    }
    const calls: RecordedRequest[] = []
    await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createDeps({
        audit,
        calls,
        profiles: [loadedProfile(), loadedProfile({ email: CHANGED_EMAIL })],
      })
    )
    const rows = () => (audit as AuditLease & { rows: EmailAttempt[] }).rows
    const scheduled = rows()[0]
    expect(scheduled).toMatchObject({
      recipientEmail: FETCHED_EMAIL,
      nextAttemptAt: new Date(START + 60_000).toISOString(),
      attemptCount: 1,
      processingState: CONTACT_SYNC_FAILED,
    })
    expect(ownerToken).toBeTruthy()

    const overwritten = await audit.assignRecipient({
      id: scheduled?.id ?? '',
      claimToken: ownerToken ?? '',
      recipientEmail: CHANGED_EMAIL,
    })
    const rescheduled = await audit.transition({
      id: scheduled?.id ?? '',
      claimToken: ownerToken ?? '',
      expectedState: 'contact_sync_failed',
      nextState: 'contact_sync_pending',
      attemptCount: 1,
      nextAttemptAt: null,
      errorMessage: null,
      deliveryStatus: 'queued',
      resendEmailId: null,
      providerEvent: { category: 'recipient_changed' },
      leaseSeconds: PRE_SEND_LEASE_SECONDS,
      clearLease: false,
    })
    expect(overwritten).toBeNull()
    expect(rescheduled).toBeNull()
    expect(rows()[0]).toMatchObject({
      recipientEmail: FETCHED_EMAIL,
      nextAttemptAt: scheduled?.nextAttemptAt,
      attemptCount: 1,
      processingState: CONTACT_SYNC_FAILED,
      errorMessage: 'recipient_changed',
    })
    expect(eventPosts(calls)).toHaveLength(0)
  })
})

const FORBIDDEN_AUDIT_COLUMNS = [
  'provider_email_id',
  'error_text',
  'provider_metadata',
] as const

describe('production application email lease RPC payloads', () => {
  const supabaseUrl = 'https://example.supabase.co'
  const serviceKey = 'test-service-role-key'
  const claimToken = '66666666-6666-4666-8666-666666666666'

  function auditRow(state: string, token: string | null) {
    return {
      id: AUDIT_ID,
      application_id: PROFILE_ID,
      recipient_email: FETCHED_EMAIL,
      event_key: 'application_submitted:1',
      application_status: 'submitted',
      resend_event_name: 'application_submitted',
      submission_version: 1,
      processing_state: state,
      claim_token: token,
      claimed_until: new Date(Date.now() + 30_000).toISOString(),
      attempt_count: 0,
      next_attempt_at:
        state === 'contact_sync_pending' ? '2026-10-07T17:00:00.000Z' : null,
      delivery_status:
        state === 'event_accepted' || state === 'event_submission_unknown'
          ? 'unconfirmed'
          : 'queued',
      error_message:
        state === 'event_submission_unknown' ? 'event_submission_unknown' : null,
      resend_email_id: null,
      provider_event: { category: state },
    }
  }

  function productionDeps(options?: {
    resendStatus?: number
    resendBody?: unknown
    resendThrow?: boolean
    restBodies?: Record<string, unknown>[]
    profileResponses?: Response[]
  }) {
    const restBodies = options?.restBodies ?? []
    const profileResponses = options?.profileResponses
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
        const method = (init?.method ?? 'GET').toUpperCase()
        if (url.includes('/rest/v1/profiles')) {
          restBodies.push({ method, url, body: null })
          const scripted = profileResponses?.shift()
          if (scripted) return scripted
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
        if (url.includes('/rest/v1/rpc/')) {
          const body = JSON.parse(String(init?.body ?? '{}')) as Record<
            string,
            unknown
          >
          restBodies.push({ method, url, body })
          if (url.endsWith('/insert_application_email_pending')) {
            return new Response(
              JSON.stringify({
                inserted: true,
                row: auditRow('contact_sync_pending', null),
              }),
              { status: 200 }
            )
          }
          if (url.endsWith('/acquire_application_email_lease')) {
            return new Response(
              JSON.stringify({
                row: {
                  ...auditRow('contact_sync_pending', claimToken),
                  recipient_email: null,
                },
              }),
              { status: 200 }
            )
          }
          if (url.endsWith('/assign_application_email_recipient')) {
            return new Response(
              JSON.stringify({
                row: {
                  ...auditRow('contact_sync_pending', claimToken),
                  recipient_email: body.p_recipient_email,
                },
              }),
              { status: 200 }
            )
          }
          if (url.endsWith('/transition_application_email_attempt')) {
            const nextState = String(body.p_next_state)
            return new Response(
              JSON.stringify({
                row: auditRow(
                  nextState,
                  body.p_clear_lease === true ? null : claimToken
                ),
              }),
              { status: 200 }
            )
          }
          if (url.endsWith('/sweep_expired_event_submissions')) {
            return new Response('0', { status: 200 })
          }
          return new Response(JSON.stringify({ row: null }), { status: 200 })
        }
        if (url.startsWith(RESEND_CONTACTS_URL)) {
          if (method === 'GET') {
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
        return new Response(
          JSON.stringify(
            options?.resendBody ?? {
              object: 'event',
              event: 'application_submitted',
            }
          ),
          { status: options?.resendStatus ?? 202 }
        )
      }
    )
  }

  it('inserts pending work through the lease RPC and never sends retired audit fields', async () => {
    const restBodies: Record<string, unknown>[] = []
    await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      productionDeps({ restBodies })
    )
    const insert = restBodies.find((row) =>
      String(row.url).includes('insert_application_email_pending')
    )?.body as Record<string, unknown>
    expect(insert).toEqual({
      p_application_id: PROFILE_ID,
      p_recipient_email: null,
      p_event_key: 'application_submitted:1',
      p_application_status: 'submitted',
      p_resend_event_name: 'application_submitted',
      p_submission_version: 1,
    })
    const serialized = JSON.stringify(restBodies)
    expect(serialized).not.toContain('/rest/v1/application_email_log')
    for (const column of FORBIDDEN_AUDIT_COLUMNS) {
      expect(serialized).not.toContain(column)
    }
    const profileGet = restBodies.find((row) =>
      String(row.url).includes('/rest/v1/profiles')
    )
    expect(String(profileGet?.url)).toContain('application_draft')
    expect(String(profileGet?.url)).not.toContain('full_name')
  })

  it('records a documented 202 as event_accepted with a null email id', async () => {
    const restBodies: Record<string, unknown>[] = []
    const response = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      productionDeps({ restBodies })
    )
    expect(await response.json()).toEqual({ ok: true, result: 'event_accepted' })
    const accepted = restBodies.find(
      (row) =>
        String(row.url).includes('transition_application_email_attempt') &&
        (row.body as { p_next_state?: string }).p_next_state === 'event_accepted'
    )?.body as Record<string, unknown>
    expect(accepted).toMatchObject({
      p_expected_state: 'event_submitting',
      p_next_state: 'event_accepted',
      p_delivery_status: 'unconfirmed',
      p_error_message: null,
      p_resend_email_id: null,
      p_next_attempt_at: null,
      p_clear_lease: true,
      p_provider_event: { category: 'event_accepted' },
    })
    for (const column of FORBIDDEN_AUDIT_COLUMNS) {
      expect(JSON.stringify(accepted)).not.toContain(column)
    }
  })

  it('records a non-202 response as event_submission_unknown', async () => {
    const restBodies: Record<string, unknown>[] = []
    const response = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      productionDeps({
        restBodies,
        resendStatus: 200,
        resendBody: { id: 'evt_opaque_1' },
      })
    )
    expect(await response.json()).toEqual({
      ok: false,
      error: 'failed',
      result: 'event_submission_unknown',
    })
    const unknown = restBodies.find(
      (row) =>
        String(row.url).includes('transition_application_email_attempt') &&
        (row.body as { p_next_state?: string }).p_next_state ===
          'event_submission_unknown'
    )?.body as Record<string, unknown>
    expect(unknown).toMatchObject({
      p_next_state: 'event_submission_unknown',
      p_delivery_status: 'unconfirmed',
      p_error_message: 'event_submission_unknown',
      p_resend_email_id: null,
      p_next_attempt_at: null,
    })
    expect(JSON.stringify(unknown)).not.toContain('evt_opaque_1')
    for (const column of FORBIDDEN_AUDIT_COLUMNS) {
      expect(JSON.stringify(unknown)).not.toContain(column)
    }
  })

  it('retries a failed profile response and obsoletes only an empty lookup', async () => {
    const failedBodies: Record<string, unknown>[] = []
    const failedCalls: string[] = []
    const failed = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createProductionDeps(
        (name) =>
          ({
            APPLICATION_STATUS_WEBHOOK_SECRET: WEBHOOK_SECRET,
            RESEND_API_KEY: RESEND_KEY,
            SUPABASE_URL: supabaseUrl,
            SUPABASE_SERVICE_ROLE_KEY: serviceKey,
          })[name],
        async (input, init) => {
          const url = String(input)
          failedCalls.push(url)
          if (url.includes('/rest/v1/profiles')) {
            return new Response('unavailable', { status: 500 })
          }
          return productionDeps({ restBodies: failedBodies }).fetch(input, init)
        }
      )
    )
    expect(await failed.json()).toMatchObject({ result: CONTACT_SYNC_FAILED })
    const failure = failedBodies.find(
      (row) =>
        String(row.url).includes('transition_application_email_attempt') &&
        (row.body as { p_error_message?: string }).p_error_message ===
          'profile_load_failed'
    )
    expect(failure).toBeTruthy()
    expect(failedCalls.some((url) => url === RESEND_EVENTS_URL)).toBe(false)

    const absentBodies: Record<string, unknown>[] = []
    const absentCalls: string[] = []
    const absent = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createProductionDeps(
        (name) =>
          ({
            APPLICATION_STATUS_WEBHOOK_SECRET: WEBHOOK_SECRET,
            RESEND_API_KEY: RESEND_KEY,
            SUPABASE_URL: supabaseUrl,
            SUPABASE_SERVICE_ROLE_KEY: serviceKey,
          })[name],
        async (input, init) => {
          const url = String(input)
          absentCalls.push(url)
          if (url.includes('/rest/v1/profiles')) {
            return new Response(JSON.stringify([]), { status: 200 })
          }
          return productionDeps({ restBodies: absentBodies }).fetch(input, init)
        }
      )
    )
    expect(await absent.json()).toMatchObject({ result: 'obsolete' })
    expect(absentCalls.some((url) => url === RESEND_EVENTS_URL)).toBe(false)

    const invalidBodies: Record<string, unknown>[] = []
    const invalidCalls: string[] = []
    const invalid = await handleApplicationStatusEmailRequest(
      jsonRequest(webhookPayload({})),
      createProductionDeps(
        (name) =>
          ({
            APPLICATION_STATUS_WEBHOOK_SECRET: WEBHOOK_SECRET,
            RESEND_API_KEY: RESEND_KEY,
            SUPABASE_URL: supabaseUrl,
            SUPABASE_SERVICE_ROLE_KEY: serviceKey,
          })[name],
        async (input, init) => {
          const url = String(input)
          invalidCalls.push(url)
          if (url.includes('/rest/v1/profiles')) {
            return new Response(JSON.stringify({ error: 'not-an-array' }), {
              status: 200,
            })
          }
          return productionDeps({ restBodies: invalidBodies }).fetch(input, init)
        }
      )
    )
    expect(await invalid.json()).toMatchObject({ result: CONTACT_SYNC_FAILED })
    expect(
      invalidBodies.some(
        (row) =>
          (row.body as { p_error_message?: string } | undefined)?.p_error_message ===
          'profile_load_failed'
      )
    ).toBe(true)
    expect(invalidCalls.some((url) => url === RESEND_EVENTS_URL)).toBe(false)
  })
})
