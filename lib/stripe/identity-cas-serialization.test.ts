import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import type { Database } from '@/lib/database.types'
import {
  applyIdentityVerificationSession,
  markIdentitySessionPending,
} from '@/lib/stripe/identity'

const USER_ID = 'user_applicant_1'
const SESSION_ID = 'vs_current'

const GATES = {
  active: false,
  identity_verified: 'pending_review',
  note: 'a,b.c:d(e) "quoted"',
  nested: { inner: true, label: 'x/y' },
}

const VERIFICATION = {
  confirmed: true,
  id_verified: 'pending_review',
  note: 'semi;colon, comma.dot:colon(paren)',
  nested: { inner: false, label: 'q?x=1' },
}

const { stripeState } = vi.hoisted(() => ({
  stripeState: {
    sessions: {} as Record<string, Stripe.Identity.VerificationSession>,
  },
}))

vi.mock('@/lib/stripe/config', () => ({
  getStripe: () => ({
    identity: {
      verificationSessions: {
        retrieve: async (id: string) => {
          const session = stripeState.sessions[id]
          if (!session) throw new Error('missing session')
          return session
        },
      },
    },
  }),
  appBaseUrl: () => 'http://localhost:3000',
  isStripeIdentityConfigured: () => true,
}))

type RecordedRequest = {
  url: string
  method: string
  body: string | null
}

function session(): Stripe.Identity.VerificationSession {
  return {
    id: SESSION_ID,
    object: 'identity.verification_session',
    status: 'verified',
    metadata: { user_id: USER_ID },
  } as Stripe.Identity.VerificationSession
}

function profileRow(patch?: {
  approval_gates?: unknown
  verification_state?: unknown
  identity_verification_status?: string
}) {
  return {
    id: USER_ID,
    identity_verification_status: patch?.identity_verification_status ?? 'processing',
    identity_verification_session_id: SESSION_ID,
    approval_gates: patch && 'approval_gates' in patch ? patch.approval_gates : GATES,
    verification_state:
      patch && 'verification_state' in patch ? patch.verification_state : VERIFICATION,
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function filterValue(url: string, column: string) {
  return new URL(url).searchParams.get(column)
}

function clientFor(
  handler: (request: RecordedRequest, requests: RecordedRequest[]) => Response
): { supabase: SupabaseClient<Database>; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = []
  const fetchImpl: typeof fetch = async (input, init) => {
    const request = {
      url: typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : null,
    }
    requests.push(request)
    return handler(request, requests)
  }
  const supabase = createClient<Database>('http://127.0.0.1:54321', 'test-anon-key', {
    global: { fetch: fetchImpl },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
  return { supabase, requests }
}

describe('PostgREST identity compare-and-swap serialization', () => {
  beforeEach(() => {
    stripeState.sessions = { [SESSION_ID]: session() }
  })

  it('sends JSON text equality filters through the installed client', async () => {
    const { supabase, requests } = clientFor((request) => {
      if (request.method === 'PATCH') return jsonResponse([{ id: USER_ID }])
      return jsonResponse([profileRow()])
    })

    const userId = await applyIdentityVerificationSession(supabase, session())

    expect(userId).toBe(USER_ID)
    const patch = requests.find((request) => request.method === 'PATCH')
    expect(patch).toBeTruthy()
    const rawUrl = patch?.url ?? ''
    expect(rawUrl).not.toContain('[object Object]')
    expect(rawUrl).not.toContain('%5Bobject+Object%5D')

    const gates = filterValue(rawUrl, 'approval_gates')
    const verification = filterValue(rawUrl, 'verification_state')
    expect(gates).toBe(`eq.${JSON.stringify(GATES)}`)
    expect(verification).toBe(`eq.${JSON.stringify(VERIFICATION)}`)
    expect(JSON.parse(gates?.slice(3) ?? '')).toEqual(GATES)
    expect(JSON.parse(verification?.slice(3) ?? '')).toEqual(VERIFICATION)
    expect(filterValue(rawUrl, 'id')).toBe(`eq.${USER_ID}`)
    expect(filterValue(rawUrl, 'identity_verification_status')).toBe('eq.processing')
    expect(filterValue(rawUrl, 'identity_verification_session_id')).toBe(`eq.${SESSION_ID}`)
    expect(filterValue(rawUrl, 'select')).toBe('id')

    const body = JSON.parse(patch?.body ?? '{}') as Record<string, unknown>
    expect(body.identity_verification_status).toBe('verified')
    expect(body.identity_verification_session_id).toBe(SESSION_ID)
    expect(body.approval_gates).toMatchObject({ identity_verified: 'approved' })
    expect(body.verification_state).toMatchObject({ id_verified: 'approved' })
    expect(body).not.toHaveProperty('application_status')
    expect(body).not.toHaveProperty('role')
    expect(body).not.toHaveProperty('membership_billing')
  })

  it('uses is.null for null jsonb snapshots', async () => {
    const { supabase, requests } = clientFor((request) => {
      if (request.method === 'PATCH') return jsonResponse([{ id: USER_ID }])
      return jsonResponse([
        profileRow({ approval_gates: null, verification_state: null }),
      ])
    })

    await applyIdentityVerificationSession(supabase, session())

    const patch = requests.find((request) => request.method === 'PATCH')
    const rawUrl = patch?.url ?? ''
    expect(filterValue(rawUrl, 'approval_gates')).toBe('is.null')
    expect(filterValue(rawUrl, 'verification_state')).toBe('is.null')
    expect(filterValue(rawUrl, 'identity_verification_session_id')).toBe(`eq.${SESSION_ID}`)
    expect(rawUrl).not.toContain('[object Object]')
  })

  it('retries a zero-row update with a rebuilt snapshot and rejects database errors', async () => {
    let reads = 0
    const { supabase, requests } = clientFor((request) => {
      if (request.method === 'PATCH') {
        const patches = requests.filter((item) => item.method === 'PATCH')
        if (patches.length === 1) return jsonResponse([])
        return jsonResponse([{ id: USER_ID }])
      }
      reads += 1
      const gates =
        reads === 1 ? GATES : { ...GATES, email_verified: 'approved' }
      return jsonResponse([profileRow({ approval_gates: gates })])
    })

    const userId = await applyIdentityVerificationSession(supabase, session())
    expect(userId).toBe(USER_ID)

    const patches = requests.filter((request) => request.method === 'PATCH')
    expect(patches).toHaveLength(2)
    expect(JSON.parse(filterValue(patches[0].url, 'approval_gates')?.slice(3) ?? '')).toEqual(
      GATES
    )
    expect(
      JSON.parse(filterValue(patches[1].url, 'approval_gates')?.slice(3) ?? '')
    ).toMatchObject({ email_verified: 'approved', note: GATES.note })
    expect(patches[1].url).not.toContain('[object Object]')

    const failing = clientFor((request) => {
      if (request.method === 'PATCH') {
        return jsonResponse(
          { message: 'invalid input syntax for type json', code: '22P02' },
          400
        )
      }
      return jsonResponse([profileRow()])
    })
    await expect(
      applyIdentityVerificationSession(failing.supabase, session())
    ).rejects.toThrow('Identity status update failed')
    expect(
      failing.requests.some((request) => request.url.includes('22P02'))
    ).toBe(false)
  })

  it('does not treat an empty update or a database error as session registration', async () => {
    let patches = 0
    const retrying = clientFor((request) => {
      if (request.method === 'PATCH') {
        patches += 1
        if (patches < 3) return jsonResponse([])
        return jsonResponse([{ id: USER_ID }])
      }
      return jsonResponse([
        profileRow({ identity_verification_status: 'not_started' }),
      ])
    })

    const registered = await markIdentitySessionPending(
      retrying.supabase,
      USER_ID,
      'vs_new',
      SESSION_ID
    )
    expect(registered).toEqual({ ok: true })
    expect(patches).toBe(3)

    const exhausted = clientFor((request) => {
      if (request.method === 'PATCH') return jsonResponse([])
      return jsonResponse([
        profileRow({ identity_verification_status: 'not_started' }),
      ])
    })
    const conflict = await markIdentitySessionPending(
      exhausted.supabase,
      USER_ID,
      'vs_new',
      SESSION_ID
    )
    expect(conflict).toEqual({ ok: false, reason: 'conflict' })

    const broken = clientFor((request) => {
      if (request.method === 'PATCH') {
        return jsonResponse({ message: 'permission denied', code: '42501' }, 403)
      }
      return jsonResponse([
        profileRow({ identity_verification_status: 'not_started' }),
      ])
    })
    await expect(
      markIdentitySessionPending(broken.supabase, USER_ID, 'vs_new', SESSION_ID)
    ).rejects.toThrow('Identity status update failed')
  })
})
