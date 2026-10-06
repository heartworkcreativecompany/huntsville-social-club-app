import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import { IDENTITY_FORBIDDEN_PROFILE_KEYS } from '@/lib/stripe/identity-status'
import {
  applyIdentityVerificationSession,
  markIdentitySessionPending,
  reconcileIdentityVerification,
  startMemberIdentityVerification,
} from '@/lib/stripe/identity'

const USER_ID = 'user_applicant_1'
const SESSION_A = 'vs_abandoned'
const SESSION_B = 'vs_current'

const { stripeState } = vi.hoisted(() => ({
  stripeState: {
    sessions: {} as Record<string, Stripe.Identity.VerificationSession>,
    create: vi.fn(),
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
        create: (...args: unknown[]) => stripeState.create(...args),
      },
    },
  }),
  appBaseUrl: () => 'http://localhost:3000',
  isStripeIdentityConfigured: () => true,
}))

type ProfileRow = {
  id: string
  identity_verification_status: string
  identity_verification_session_id: string | null
  approval_gates: Record<string, string> | null
  verification_state: Record<string, string> | null
  identity_verification_last_error?: string | null
}

function session(input: {
  id: string
  status: Stripe.Identity.VerificationSession.Status
  userId?: string | null
  lastError?: { code?: string; reason?: string } | null
  verifiedOutputs?: Record<string, unknown>
}): Stripe.Identity.VerificationSession {
  return {
    id: input.id,
    object: 'identity.verification_session',
    status: input.status,
    metadata: input.userId === null ? {} : { user_id: input.userId ?? USER_ID },
    last_error: input.lastError
      ? {
          code: input.lastError.code as Stripe.Identity.VerificationSession.LastError.Code,
          reason: input.lastError.reason ?? null,
        }
      : null,
    verified_outputs: input.verifiedOutputs,
  } as unknown as Stripe.Identity.VerificationSession
}

type Filter =
  | { op: 'eq'; column: string; value: unknown }
  | { op: 'is'; column: string; value: null }

function matchesSnapshot(row: ProfileRow, filters: Filter[]): boolean {
  return filters.every((filter) => {
    const current = row[filter.column as keyof ProfileRow]
    if (filter.op === 'is') return current == null
    if (filter.column === 'approval_gates' || filter.column === 'verification_state') {
      return JSON.stringify(current ?? null) === JSON.stringify(filter.value ?? null)
    }
    return current === filter.value
  })
}

function profileDb(initial: ProfileRow) {
  const row = structuredClone(initial)
  const updates: Record<string, unknown>[] = []
  const predicates: Filter[][] = []
  let updateQueue = Promise.resolve()
  let beforeCommit: (() => void) | null = null

  function builder(kind: 'select' | 'update', patch?: Record<string, unknown>) {
    const filters: Filter[] = []
    const api = {
      eq(column: string, value: unknown) {
        filters.push({ op: 'eq', column, value })
        return api
      },
      is(column: string, value: null) {
        filters.push({ op: 'is', column, value })
        return api
      },
      select() {
        return api
      },
      maybeSingle: async () => ({ data: structuredClone(row), error: null }),
      then(
        resolve: (value: { data: { id: string }[] | null; error: null }) => unknown,
        reject?: (reason: unknown) => unknown
      ) {
        const run = updateQueue.then(() => {
          if (kind !== 'update' || !patch) return { data: [], error: null as null }
          if (beforeCommit) {
            const hook = beforeCommit
            beforeCommit = null
            hook()
          }
          if (!matchesSnapshot(row, filters)) return { data: [], error: null as null }
          predicates.push(filters.map((filter) => ({ ...filter })))
          Object.assign(row, structuredClone(patch))
          updates.push(structuredClone(patch))
          return { data: [{ id: row.id }], error: null as null }
        })
        updateQueue = run.then(
          () => undefined,
          () => undefined
        )
        return run.then(resolve, reject)
      },
    }
    return api
  }

  const supabase = {
    from(table: string) {
      if (table !== 'profiles') throw new Error(`unexpected table ${table}`)
      return {
        select() {
          return builder('select')
        },
        update(patch: Record<string, unknown>) {
          return builder('update', patch)
        },
      }
    },
  }

  return {
    supabase: supabase as never,
    updates,
    predicates,
    get profile() {
      return row
    },
    setBeforeCommit(hook: () => void) {
      beforeCommit = hook
    },
  }
}

function expectNoForbiddenKeys(patch: Record<string, unknown>) {
  for (const key of IDENTITY_FORBIDDEN_PROFILE_KEYS) {
    expect(patch).not.toHaveProperty(key)
  }
  const serialized = JSON.stringify(patch)
  expect(serialized).not.toContain('verified_outputs')
  expect(serialized).not.toContain('id_number')
  expect(serialized).not.toContain('D1234567')
}

describe('applyIdentityVerificationSession guards', () => {
  beforeEach(() => {
    stripeState.sessions = {}
    stripeState.create.mockReset()
  })

  it('stays verified when a late processing event arrives', async () => {
    stripeState.sessions[SESSION_B] = session({
      id: SESSION_B,
      status: 'processing',
    })
    const db = profileDb({
      id: USER_ID,
      identity_verification_status: 'verified',
      identity_verification_session_id: SESSION_B,
      approval_gates: { identity_verified: 'approved' },
      verification_state: { id_verified: 'approved' },
    })

    await applyIdentityVerificationSession(
      db.supabase,
      session({ id: SESSION_B, status: 'verified' })
    )

    expect(db.updates).toEqual([])
    expect(db.profile.identity_verification_status).toBe('verified')
  })

  it('stays verified when a late event arrives from an abandoned session', async () => {
    stripeState.sessions[SESSION_A] = session({
      id: SESSION_A,
      status: 'processing',
      verifiedOutputs: { id_number: 'D1234567' },
    })
    const db = profileDb({
      id: USER_ID,
      identity_verification_status: 'verified',
      identity_verification_session_id: SESSION_B,
      approval_gates: { identity_verified: 'approved' },
      verification_state: { id_verified: 'approved' },
    })

    await applyIdentityVerificationSession(
      db.supabase,
      session({ id: SESSION_A, status: 'processing' })
    )

    expect(db.updates).toEqual([])
    expect(db.profile.identity_verification_status).toBe('verified')
    expect(db.profile.identity_verification_session_id).toBe(SESSION_B)
  })

  it('lets a verified event from a non-current session become the current session', async () => {
    stripeState.sessions[SESSION_A] = session({
      id: SESSION_A,
      status: 'verified',
      verifiedOutputs: { id_number: 'D1234567' },
    })
    const db = profileDb({
      id: USER_ID,
      identity_verification_status: 'processing',
      identity_verification_session_id: SESSION_B,
      approval_gates: { identity_verified: 'pending_review' },
      verification_state: { id_verified: 'pending_review' },
    })

    await applyIdentityVerificationSession(
      db.supabase,
      session({ id: SESSION_A, status: 'processing' })
    )

    expect(db.updates).toHaveLength(1)
    expect(db.profile.identity_verification_status).toBe('verified')
    expect(db.profile.identity_verification_session_id).toBe(SESSION_A)
    expectNoForbiddenKeys(db.updates[0]!)
  })

  it('still records requires_input on the current session', async () => {
    stripeState.sessions[SESSION_B] = session({
      id: SESSION_B,
      status: 'requires_input',
      lastError: {
        code: 'document_expired',
        reason: 'Document number D1234567 expired',
      },
    })
    const db = profileDb({
      id: USER_ID,
      identity_verification_status: 'processing',
      identity_verification_session_id: SESSION_B,
      approval_gates: { identity_verified: 'pending_review' },
      verification_state: { id_verified: 'pending_review' },
    })

    await applyIdentityVerificationSession(
      db.supabase,
      session({ id: SESSION_B, status: 'processing' })
    )

    expect(db.profile.identity_verification_status).toBe('requires_input')
    expect(db.profile.identity_verification_last_error).toMatch(/expired/i)
    expect(String(db.profile.identity_verification_last_error)).not.toContain(
      'D1234567'
    )
    expectNoForbiddenKeys(db.updates[0]!)
  })

  it('reconciles a stuck processing profile when Stripe says verified', async () => {
    stripeState.sessions[SESSION_B] = session({
      id: SESSION_B,
      status: 'verified',
      verifiedOutputs: { id_number: 'D1234567' },
    })
    const db = profileDb({
      id: USER_ID,
      identity_verification_status: 'processing',
      identity_verification_session_id: SESSION_B,
      approval_gates: { identity_verified: 'pending_review' },
      verification_state: { id_verified: 'pending_review' },
    })

    await reconcileIdentityVerification(USER_ID, db.supabase)

    expect(db.profile.identity_verification_status).toBe('verified')
    expect(db.profile.identity_verification_session_id).toBe(SESSION_B)
    expectNoForbiddenKeys(db.updates[0]!)
  })
})

describe('startMemberIdentityVerification', () => {
  beforeEach(() => {
    stripeState.sessions = {}
    stripeState.create.mockReset()
  })

  it('does not create a new session when the stored one is verified', async () => {
    stripeState.sessions[SESSION_B] = session({
      id: SESSION_B,
      status: 'verified',
      verifiedOutputs: { id_number: 'D1234567' },
    })
    const db = profileDb({
      id: USER_ID,
      identity_verification_status: 'processing',
      identity_verification_session_id: SESSION_B,
      approval_gates: { identity_verified: 'pending_review' },
      verification_state: { id_verified: 'pending_review' },
    })

    const result = await startMemberIdentityVerification({
      supabase: db.supabase,
      userId: USER_ID,
      email: 'applicant@example.com',
      applicationStatus: 'submitted',
      identityStatus: 'processing',
      storedSessionId: SESSION_B,
    })

    expect(result).toEqual({
      ok: false,
      error: 'Identity is already verified.',
      httpStatus: 400,
    })
    expect(stripeState.create).not.toHaveBeenCalled()
    expect(db.profile.identity_verification_status).toBe('verified')
    expectNoForbiddenKeys(db.updates[0]!)
  })
})

describe('concurrent identity writes', () => {
  const gates = {
    identity_verified: 'pending_review',
    email_verified: 'pending_review',
  }
  const verification = { id_verified: 'pending_review', email: 'pending_review' }

  function processingProfile(sessionId: string | null = SESSION_B): ProfileRow {
    return {
      id: USER_ID,
      identity_verification_status: 'processing',
      identity_verification_session_id: sessionId,
      approval_gates: gates,
      verification_state: verification,
    }
  }

  beforeEach(() => {
    stripeState.sessions = {}
    stripeState.create.mockReset()
  })

  it('does not let a slower non-verified update overwrite verified', async () => {
    stripeState.sessions[SESSION_B] = session({
      id: SESSION_B,
      status: 'processing',
    })
    const db = profileDb(processingProfile())
    db.setBeforeCommit(() => {
      db.profile.identity_verification_status = 'verified'
      db.profile.identity_verification_session_id = SESSION_B
    })

    await applyIdentityVerificationSession(
      db.supabase,
      session({ id: SESSION_B, status: 'processing' })
    )

    expect(db.updates).toEqual([])
    expect(db.profile.identity_verification_status).toBe('verified')
    expect(db.profile.identity_verification_session_id).toBe(SESSION_B)
  })

  it('does not let a stale non-current session overwrite current state', async () => {
    stripeState.sessions[SESSION_A] = session({
      id: SESSION_A,
      status: 'processing',
    })
    const db = profileDb(processingProfile(SESSION_A))
    db.setBeforeCommit(() => {
      db.profile.identity_verification_status = 'verified'
      db.profile.identity_verification_session_id = SESSION_B
    })

    await applyIdentityVerificationSession(
      db.supabase,
      session({ id: SESSION_A, status: 'processing' })
    )

    expect(db.updates).toEqual([])
    expect(db.profile.identity_verification_status).toBe('verified')
    expect(db.profile.identity_verification_session_id).toBe(SESSION_B)
  })

  it('does not downgrade a profile that is verified during session creation', async () => {
    stripeState.sessions[SESSION_B] = session({
      id: SESSION_B,
      status: 'requires_input',
    })
    stripeState.create.mockResolvedValue({
      id: 'vs_new',
      url: 'https://verify.example/new',
      status: 'requires_input',
    })
    const db = profileDb(processingProfile())
    db.setBeforeCommit(() => {
      db.profile.identity_verification_status = 'verified'
    })

    const result = await startMemberIdentityVerification({
      supabase: db.supabase,
      userId: USER_ID,
      email: 'applicant@example.com',
      applicationStatus: 'submitted',
      identityStatus: 'processing',
      storedSessionId: SESSION_B,
    })

    expect(result).toEqual({
      ok: false,
      error: 'Identity is already verified.',
      httpStatus: 400,
    })
    expect(result).not.toHaveProperty('sessionId')
    expect(db.updates).toEqual([])
    expect(db.profile.identity_verification_session_id).toBe(SESSION_B)
    expect(db.profile.identity_verification_status).toBe('verified')
  })

  it('lets only one of two session creations register a current session', async () => {
    stripeState.sessions[SESSION_B] = session({
      id: SESSION_B,
      status: 'requires_input',
    })
    let created = 0
    stripeState.create.mockImplementation(async () => {
      created += 1
      return {
        id: `vs_new_${created}`,
        url: `https://verify.example/${created}`,
        status: 'requires_input',
      }
    })
    const db = profileDb(processingProfile())

    const results = await Promise.all([
      startMemberIdentityVerification({
        supabase: db.supabase,
        userId: USER_ID,
        applicationStatus: 'submitted',
        identityStatus: 'processing',
        storedSessionId: SESSION_B,
      }),
      startMemberIdentityVerification({
        supabase: db.supabase,
        userId: USER_ID,
        applicationStatus: 'submitted',
        identityStatus: 'processing',
        storedSessionId: SESSION_B,
      }),
    ])

    const registered = results.filter((result) => result.ok)
    expect(registered).toHaveLength(1)
    expect(results.some((result) => !result.ok && result.httpStatus === 409)).toBe(
      true
    )
    expect(db.profile.identity_verification_session_id).toBe(
      registered[0] && registered[0].ok ? registered[0].sessionId : null
    )
    expect(
      results.find((result) => !result.ok)
    ).not.toHaveProperty('sessionId')
  })

  it('retries a verified update after a gate conflict and keeps the newer gates', async () => {
    stripeState.sessions[SESSION_B] = session({
      id: SESSION_B,
      status: 'verified',
    })
    const db = profileDb(processingProfile())
    db.setBeforeCommit(() => {
      db.profile.approval_gates = {
        identity_verified: 'pending_review',
        email_verified: 'approved',
      }
      db.profile.verification_state = {
        id_verified: 'pending_review',
        email: 'approved',
      }
    })

    await applyIdentityVerificationSession(
      db.supabase,
      session({ id: SESSION_B, status: 'verified' })
    )

    expect(db.profile.identity_verification_status).toBe('verified')
    expect(db.profile.approval_gates).toMatchObject({
      email_verified: 'approved',
      identity_verified: 'approved',
    })
    expect(db.profile.verification_state).toMatchObject({ email: 'approved' })
    expect(db.updates.at(-1)?.approval_gates).toMatchObject({
      email_verified: 'approved',
    })
  })

  it('rejects a verified write that keeps conflicting instead of using a stale patch', async () => {
    stripeState.sessions[SESSION_B] = session({
      id: SESSION_B,
      status: 'verified',
    })
    const db = profileDb(processingProfile())
    const rotate = () => {
      db.profile.approval_gates = {
        identity_verified: 'pending_review',
        email_verified: 'approved',
        nonce: String(Math.random()),
      }
      db.setBeforeCommit(rotate)
    }
    db.setBeforeCommit(rotate)

    await expect(
      applyIdentityVerificationSession(
        db.supabase,
        session({ id: SESSION_B, status: 'verified' })
      )
    ).rejects.toThrow(/conflicted/i)
    expect(db.updates).toEqual([])
    expect(db.profile.identity_verification_status).toBe('processing')
  })

  it('does not write when live session metadata is missing or belongs to someone else', async () => {
    stripeState.sessions[SESSION_A] = session({
      id: SESSION_A,
      status: 'verified',
      userId: 'other-applicant',
    })
    const mismatched = profileDb(processingProfile(SESSION_A))
    await applyIdentityVerificationSession(
      mismatched.supabase,
      session({ id: SESSION_A, status: 'verified' })
    )
    expect(mismatched.updates).toEqual([])
    expect(mismatched.profile.identity_verification_status).toBe('processing')

    stripeState.sessions[SESSION_B] = session({
      id: SESSION_B,
      status: 'verified',
      userId: null,
    })
    const missing = profileDb(processingProfile())
    await applyIdentityVerificationSession(
      missing.supabase,
      session({ id: SESSION_B, status: 'verified', userId: null })
    )
    expect(missing.updates).toEqual([])
  })

  it('does not let reconciliation write another applicant profile', async () => {
    stripeState.sessions[SESSION_B] = session({
      id: SESSION_B,
      status: 'verified',
      userId: 'other-applicant',
    })
    const db = profileDb(processingProfile())

    await reconcileIdentityVerification(USER_ID, db.supabase)

    expect(db.updates).toEqual([])
    expect(db.profile.id).toBe(USER_ID)
    expect(db.profile.identity_verification_status).toBe('processing')
  })

  it('does not write when Stripe retrieval fails', async () => {
    const db = profileDb(processingProfile())

    await expect(
      applyIdentityVerificationSession(
        db.supabase,
        session({ id: 'vs_missing', status: 'verified' })
      )
    ).rejects.toThrow(/missing session/i)
    expect(db.updates).toEqual([])

    await reconcileIdentityVerification(USER_ID, db.supabase)
    expect(db.updates).toEqual([])
    expect(db.profile.identity_verification_status).toBe('processing')
  })

  it('uses IS NULL when the current session id and json fields are null', async () => {
    stripeState.sessions[SESSION_B] = session({
      id: SESSION_B,
      status: 'verified',
    })
    const db = profileDb({
      id: USER_ID,
      identity_verification_status: 'not_started',
      identity_verification_session_id: null,
      approval_gates: null,
      verification_state: null,
    })

    await applyIdentityVerificationSession(
      db.supabase,
      session({ id: SESSION_B, status: 'verified' })
    )

    expect(db.profile.identity_verification_status).toBe('verified')
    expect(db.predicates[0]).toEqual(
      expect.arrayContaining([
        { op: 'is', column: 'identity_verification_session_id', value: null },
        { op: 'is', column: 'approval_gates', value: null },
        { op: 'is', column: 'verification_state', value: null },
      ])
    )

    const raced = profileDb({
      id: USER_ID,
      identity_verification_status: 'not_started',
      identity_verification_session_id: null,
      approval_gates: null,
      verification_state: null,
    })
    const [first, second] = await Promise.all([
      markIdentitySessionPending(raced.supabase, USER_ID, 'vs_one', null),
      markIdentitySessionPending(raced.supabase, USER_ID, 'vs_two', null),
    ])
    expect([first, second].filter((result) => result.ok)).toHaveLength(1)
    expect(raced.predicates[0]).toEqual(
      expect.arrayContaining([
        { op: 'is', column: 'identity_verification_session_id', value: null },
      ])
    )
  })

  it('registers a session only against the session id observed beforehand', async () => {
    const db = profileDb(processingProfile(SESSION_B))
    const [first, second] = await Promise.all([
      markIdentitySessionPending(db.supabase, USER_ID, 'vs_one', SESSION_B),
      markIdentitySessionPending(db.supabase, USER_ID, 'vs_two', SESSION_B),
    ])

    const successes = [first, second].filter((result) => result.ok)
    expect(successes).toHaveLength(1)
    expect(db.profile.identity_verification_session_id).toMatch(/^vs_/)
    expect(
      [first, second].filter((result) => !result.ok).map((result) => result.reason)
    ).toContain('conflict')
  })
})

describe('identity status call sites', () => {
  const statusPage = readFileSync(
    join(process.cwd(), 'app/(club)/application/status/page.tsx'),
    'utf8'
  )
  const sessionRoute = readFileSync(
    join(process.cwd(), 'app/api/stripe/identity/session/route.ts'),
    'utf8'
  )
  const adminAction = readFileSync(
    join(process.cwd(), 'app/(club)/admin/applications/actions.ts'),
    'utf8'
  )
  const adminPage = readFileSync(
    join(process.cwd(), 'app/(club)/admin/applications/[id]/page.tsx'),
    'utf8'
  )
  const refreshButton = readFileSync(
    join(process.cwd(), 'components/admin/refresh-identity-status-button.tsx'),
    'utf8'
  )

  it('reconciles only the signed-in applicant on the status page', () => {
    expect(statusPage).toContain('reconcileIdentityVerification(viewer.userId, supabase)')
    expect(statusPage).toContain("params.identity === 'return'")
    expect(statusPage).toContain("identityStatus === 'pending'")
    expect(statusPage).toContain("identityStatus === 'processing'")
    expect(statusPage).not.toContain('createAdminClient')
  })

  it('checks the stored session before creating another one', () => {
    expect(sessionRoute).toContain('startMemberIdentityVerification')
    expect(sessionRoute).toContain('identity_verification_session_id')
    expect(sessionRoute).not.toContain('verificationSessions.create')
  })

  it('refreshes identity from Stripe only after the admin check', () => {
    const action = adminAction.slice(
      adminAction.indexOf('export async function refreshApplicantIdentityStatus')
    )
    expect(action.indexOf('requireAdmin()')).toBeGreaterThan(-1)
    expect(action.indexOf('requireAdmin()')).toBeLessThan(
      action.indexOf('reconcileIdentityVerification')
    )
    expect(adminPage).toContain('RefreshIdentityStatusButton')
    expect(refreshButton).toContain('Refresh identity status from Stripe')
  })
})
