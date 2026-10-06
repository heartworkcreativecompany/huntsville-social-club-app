import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import { IDENTITY_FORBIDDEN_PROFILE_KEYS } from '@/lib/stripe/identity-status'
import {
  applyIdentityVerificationSession,
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
  approval_gates: Record<string, string>
  verification_state: Record<string, string>
  identity_verification_last_error?: string | null
}

function session(input: {
  id: string
  status: Stripe.Identity.VerificationSession.Status
  lastError?: { code?: string; reason?: string } | null
  verifiedOutputs?: Record<string, unknown>
}): Stripe.Identity.VerificationSession {
  return {
    id: input.id,
    object: 'identity.verification_session',
    status: input.status,
    metadata: { user_id: USER_ID },
    last_error: input.lastError
      ? {
          code: input.lastError.code as Stripe.Identity.VerificationSession.LastError.Code,
          reason: input.lastError.reason ?? null,
        }
      : null,
    verified_outputs: input.verifiedOutputs,
  } as unknown as Stripe.Identity.VerificationSession
}

function profileDb(initial: ProfileRow) {
  const updates: Record<string, unknown>[] = []
  const profile = { ...initial }
  const supabase = {
    from(table: string) {
      if (table !== 'profiles') throw new Error(`unexpected table ${table}`)
      return {
        select() {
          return {
            eq(_column: string, value: string) {
              return {
                maybeSingle: async () => {
                  if (
                    value === profile.id ||
                    value === profile.identity_verification_session_id
                  ) {
                    return { data: { ...profile }, error: null }
                  }
                  return { data: null, error: null }
                },
              }
            },
          }
        },
        update(patch: Record<string, unknown>) {
          return {
            eq: async () => {
              updates.push(patch)
              Object.assign(profile, patch)
              return { error: null }
            },
          }
        },
      }
    },
  }
  return { supabase: supabase as never, updates, profile }
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
