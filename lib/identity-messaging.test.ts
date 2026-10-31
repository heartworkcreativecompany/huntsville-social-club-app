import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  acceptedIdentityStatus,
  classifyInPersonLookup,
  IDENTITY_LOOKUP_UNAVAILABLE_MESSAGE,
  IDENTITY_MUTUAL_MESSAGE,
  IDENTITY_REQUIRED_BEFORE_MESSAGING,
  type AcceptedIdentityStatus,
} from '@/lib/identity-verification'
import {
  isMemberPubliclyVerified,
  publicVerifiedBadgeReason,
  type VerificationState,
} from '@/lib/membership-systems'

const FULL_PROFILE: VerificationState = {
  email: 'approved',
  phone: 'approved',
  profile_reviewed: 'approved',
  photo_reviewed: 'approved',
  locality: 'approved',
}

const active = { status: 'verified' as const, revokedAt: null }
const revoked = { status: 'revoked' as const, revokedAt: '2026-10-28T00:00:00.000Z' }

function identity(input: {
  stripeStatus?: string | null
  inPerson?: typeof active | typeof revoked | null
  lookupFailed?: boolean
  paid?: boolean
  approvalGateIdentity?: string | null
}) {
  return acceptedIdentityStatus({
    stripeStatus: input.stripeStatus,
    inPersonLookup: input.lookupFailed
      ? { ok: false }
      : { ok: true, record: input.inPerson ?? null },
    billingTier: input.paid ? 'inner_circle' : 'member',
    approvalGateIdentity: input.approvalGateIdentity,
  })
}

function messageDecision(input: {
  signedIn?: boolean
  approved?: boolean
  suspended?: boolean
  blocked?: boolean
  sender: AcceptedIdentityStatus
  recipient?: AcceptedIdentityStatus
  paid?: boolean
}) {
  if (input.signedIn === false) return { allowed: false, reason: 'signed_out' }
  if (input.approved === false) return { allowed: false, reason: 'membership' }
  if (input.suspended) return { allowed: false, reason: 'suspended' }
  if (input.blocked) return { allowed: false, reason: 'blocked' }
  if (input.sender === 'unavailable') {
    return { allowed: false, reason: IDENTITY_LOOKUP_UNAVAILABLE_MESSAGE }
  }
  if (input.sender !== 'verified') {
    return { allowed: false, reason: IDENTITY_REQUIRED_BEFORE_MESSAGING }
  }
  if (input.recipient === 'unavailable') {
    return { allowed: false, reason: IDENTITY_LOOKUP_UNAVAILABLE_MESSAGE }
  }
  if (input.recipient && input.recipient !== 'verified') {
    return { allowed: false, reason: IDENTITY_MUTUAL_MESSAGE }
  }
  void input.paid
  return { allowed: true, reason: 'allowed' }
}

describe('accepted identity evidence', () => {
  it('accepts Stripe verification without an in-person row', () => {
    expect(identity({ stripeStatus: 'verified', inPerson: null })).toBe('verified')
  })

  it('accepts an active admin in-person row without Stripe', () => {
    expect(identity({ stripeStatus: 'not_started', inPerson: active })).toBe('verified')
  })

  it('accepts an active legacy in-person row without Stripe', () => {
    expect(identity({ stripeStatus: 'pending', inPerson: active })).toBe('verified')
  })

  it('accepts both sources together', () => {
    expect(identity({ stripeStatus: 'verified', inPerson: active })).toBe('verified')
  })

  it('rejects a revoked in-person row when Stripe is not verified', () => {
    expect(identity({ stripeStatus: 'pending', inPerson: revoked })).toBe('unverified')
  })

  it('keeps Stripe eligibility after in-person revocation', () => {
    expect(identity({ stripeStatus: 'verified', inPerson: revoked })).toBe('verified')
  })

  it('rejects neither source', () => {
    expect(identity({ stripeStatus: 'not_started', inPerson: null })).toBe('unverified')
  })

  it('does not treat membership approval or the legacy gate as identity', () => {
    expect(
      identity({
        stripeStatus: 'not_started',
        inPerson: null,
        approvalGateIdentity: 'approved',
        paid: true,
      })
    ).toBe('unverified')
  })

  it('does not grant access when the in-person lookup fails', () => {
    expect(
      identity({ stripeStatus: 'verified', lookupFailed: true })
    ).toBe('unavailable')
    expect(classifyInPersonLookup({ error: { message: 'timeout' }, record: null })).toEqual({
      ok: false,
    })
    expect(classifyInPersonLookup({ error: null, record: null })).toEqual({
      ok: true,
      record: null,
    })
  })
})

describe('intentional messaging authorization', () => {
  it('denies a paid member who is not identity verified', () => {
    expect(
      messageDecision({ sender: 'unverified', recipient: 'verified', paid: true })
    ).toEqual({ allowed: false, reason: IDENTITY_REQUIRED_BEFORE_MESSAGING })
  })

  it('allows a free identity-verified member to start an intentional message', () => {
    expect(
      messageDecision({
        sender: 'verified',
        recipient: 'verified',
        paid: false,
        approved: true,
      }).allowed
    ).toBe(true)
  })

  it('does not let accepted identity bypass recipient acceptance', () => {
    expect(
      messageDecision({
        sender: 'verified',
        recipient: 'unverified',
        paid: true,
        approved: true,
      })
    ).toEqual({ allowed: false, reason: IDENTITY_MUTUAL_MESSAGE })
  })

  it('denies sending in an existing conversation when the sender is unverified', () => {
    expect(messageDecision({ sender: 'unverified' }).allowed).toBe(false)
  })

  it('keeps an independent block denial ahead of identity', () => {
    expect(
      messageDecision({ sender: 'verified', recipient: 'verified', blocked: true })
    ).toEqual({ allowed: false, reason: 'blocked' })
  })

  it('does not describe a lookup failure as unverified', () => {
    const decision = messageDecision({ sender: 'unavailable', paid: true })
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe(IDENTITY_LOOKUP_UNAVAILABLE_MESSAGE)
    expect(decision.reason).not.toBe(IDENTITY_REQUIRED_BEFORE_MESSAGING)
  })
})

describe('public verified badge', () => {
  it('shows the badge only when profile checks and accepted identity both pass', () => {
    expect(isMemberPubliclyVerified(FULL_PROFILE, 'verified')).toBe(true)
    expect(publicVerifiedBadgeReason(FULL_PROFILE, 'verified')).toBe('shown')
  })

  it('hides the badge for an approved gate without identity evidence', () => {
    expect(isMemberPubliclyVerified(FULL_PROFILE, 'unverified')).toBe(false)
    expect(publicVerifiedBadgeReason(FULL_PROFILE, 'unverified')).toBe(
      'hidden_identity_unverified'
    )
  })

  it('withholds the badge on lookup failure instead of calling the member unverified', () => {
    expect(publicVerifiedBadgeReason(FULL_PROFILE, 'unavailable')).toBe(
      'hidden_identity_unavailable'
    )
    expect(isMemberPubliclyVerified(FULL_PROFILE, 'unavailable')).toBe(false)
  })

  it('still requires the independent profile checks', () => {
    expect(
      publicVerifiedBadgeReason(
        { ...FULL_PROFILE, phone: 'incomplete' },
        'verified'
      )
    ).toBe('hidden_profile_requirements')
  })
})

describe('message write paths', () => {
  const actions = readFileSync('app/(club)/messages/actions.ts', 'utf8')
  const requests = readFileSync('lib/message-request-flow.ts', 'utf8')
  const recontact = readFileSync('lib/message-recontact-flow.ts', 'utf8')
  const intros = readFileSync('app/(club)/members/intro-actions.ts', 'utf8')
  const matches = readFileSync('app/(club)/matches/actions.ts', 'utf8')
  const sql = readFileSync(
    'supabase/migrations/20261028180000_messaging_identity_access.sql',
    'utf8'
  )

  it('enforces accepted identity on every member message write', () => {
    for (const name of [
      'sendMessageRequest',
      'acceptMessageRequestAction',
      'declineMessageRequestAction',
      'sendMemberMessage',
      'retryMessageRequestAction',
    ]) {
      const start = actions.indexOf(`export async function ${name}`)
      expect(start, name).toBeGreaterThan(-1)
      const next = actions.indexOf('\nexport async function ', start + 10)
      const body = actions.slice(start, next === -1 ? undefined : next)
      expect(body, name).toMatch(/assertMessagingAllowed|assertCanStartMessageRequest/)
    }

    const participants = readFileSync('lib/messaging-participants.ts', 'utf8')
    expect(requests).toContain('assertMembersMayExchange')
    expect(recontact).toContain('assertMembersMayExchange')
    expect(participants).toContain('loadAcceptedIdentityStatus')
    expect(actions).toContain('requireOtherIdentity: false')
    expect(intros).toContain('assertCanStartMessageRequest')
    expect(matches).toContain('sendMessageRequest')
    expect(matches).not.toContain('entitlements?.canMessage')
  })

  it('replaces paid messaging RLS with the shared identity function', () => {
    expect(sql).toContain('profile_has_accepted_identity')
    expect(sql).not.toContain('member_has_paid_messaging')
    expect(sql).toContain("c.status = 'accepted'")
    expect(sql).toContain('sender_id = (select auth.uid())')
    expect(sql).toContain('public.is_admin((select auth.uid()))')
    expect(sql).toContain('grant execute on function public.profile_has_accepted_identity(uuid) to authenticated')
    expect(sql).toContain('member_messaging_send_allowed')
    expect(sql).toContain('member_can_read_message_history')
    expect(sql).not.toContain('approval_gates')

    const readPolicy = sql.slice(
      sql.indexOf('create policy "Participants read messages"'),
      sql.indexOf('drop policy if exists "Participants send messages"')
    )
    expect(readPolicy).toContain('member_can_read_message_history')
    expect(readPolicy).not.toContain('profile_has_accepted_identity')

    const sendPolicy = sql.slice(
      sql.indexOf('create policy "Participants send messages"'),
      sql.indexOf('revoke update on public.member_messages')
    )
    expect(sendPolicy).toContain('profile_has_accepted_identity')
    expect(sendPolicy).toContain('member_messaging_send_allowed')
    expect(sendPolicy).toContain('coalesce(is_system, false) = false')
  })
})
