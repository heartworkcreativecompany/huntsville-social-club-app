import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  IDENTITY_LOOKUP_UNAVAILABLE_MESSAGE,
  IDENTITY_REQUIRED_BEFORE_MESSAGING,
} from '@/lib/identity-verification'
import { createMessageRequest } from '@/lib/message-request-flow'

const REQUESTER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TARGET = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const RECOMMENDATION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

type Scenario = {
  suspended?: boolean
  unapproved?: boolean
  blocked?: boolean
  stripeStatus?: string | 'error'
  inPersonError?: boolean
  existingIntroStatus?: string | null
}

describe('recommendation message requests', () => {
  it('enters the normal request path instead of opening a conversation', () => {
    const matches = readFileSync(
      join(__dirname, '../app/(club)/matches/actions.ts'),
      'utf8'
    )
    const messages = readFileSync(
      join(__dirname, '../app/(club)/messages/actions.ts'),
      'utf8'
    )
    const request = matches.slice(
      matches.indexOf('export async function requestCuratedMatchIntro'),
      matches.indexOf('export async function passCuratedRecommendation')
    )
    expect(request).toContain('sendMessageRequest')
    expect(request).not.toContain('acceptMessageRequest')
    const send = messages.slice(
      messages.indexOf('export async function sendMessageRequest'),
      messages.indexOf('\nexport async function ', messages.indexOf('export async function sendMessageRequest') + 10)
    )
    expect(send).toContain('assertCanStartMessageRequest')
    expect(send).toContain('createMessageRequest')
    expect(send.indexOf('assertCanStartMessageRequest')).toBeLessThan(
      send.indexOf('createMessageRequest')
    )
  })

  it('rejects a duplicate recommendation request before inserting', async () => {
    const writes: string[] = []
    const result = await createMessageRequest(client(writes, {
      existingIntroStatus: 'pending',
    }), requestInput())
    expect(result).toEqual({
      ok: false,
      error: 'You already sent a message request for this match.',
    })
    expect(writes).toEqual([])
  })

  it('rejects a blocked pair', async () => {
    const writes: string[] = []
    const result = await createMessageRequest(
      client(writes, { blocked: true }),
      requestInput()
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/cannot message|unavailable for messaging/)
    }
    expect(writes).toEqual([])
  })

  it('rejects a suspended member', async () => {
    const writes: string[] = []
    const result = await createMessageRequest(
      client(writes, { suspended: true }),
      requestInput()
    )
    expect(result).toEqual({
      ok: false,
      error: 'Messaging is suspended for one of the members in this request.',
    })
    expect(writes).toEqual([])
  })

  it('rejects an unapproved member', async () => {
    const result = await createMessageRequest(
      client([], { unapproved: true }),
      requestInput()
    )
    expect(result).toEqual({
      ok: false,
      error: 'Both members must be approved to message.',
    })
  })

  it('rejects identity revocation when no accepted source remains', async () => {
    const result = await createMessageRequest(
      client([], { stripeStatus: 'canceled' }),
      requestInput()
    )
    expect(result).toEqual({
      ok: false,
      error: IDENTITY_REQUIRED_BEFORE_MESSAGING,
    })
  })

  it('rejects an identity lookup failure without treating it as unverified', async () => {
    const result = await createMessageRequest(
      client([], { stripeStatus: 'error' }),
      requestInput()
    )
    expect(result).toEqual({
      ok: false,
      error: IDENTITY_LOOKUP_UNAVAILABLE_MESSAGE,
    })
  })

  it('keeps a verified request pending and records the member intro row', async () => {
    const writes: string[] = []
    const result = await createMessageRequest(client(writes, {}), requestInput())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.result.conversationId).toBe('conversation-new')
      expect(result.result.recommendationId).toBe(RECOMMENDATION)
    }
    expect(writes).toContain('member_conversations:pending')
    expect(writes).toContain('member_intro_requests:member')
  })
})

function requestInput() {
  return {
    requesterId: REQUESTER,
    targetMemberId: TARGET,
    body: 'Hello from a recommendation.',
    recommendationId: RECOMMENDATION,
  }
}

function client(
  writes: string[],
  scenario: Scenario
): SupabaseClient<Database> {
  return {
    from(table: string) {
      const state = {
        action: 'select' as 'select' | 'insert' | 'update',
        payload: null as Record<string, unknown> | null,
      }
      const builder = {
        select: () => builder,
        insert: (payload: Record<string, unknown>) => {
          state.action = 'insert'
          state.payload = payload
          if (table === 'member_conversations') {
            writes.push(`member_conversations:${String(payload.status)}`)
          }
          if (table === 'member_intro_requests') {
            writes.push(`member_intro_requests:${String(payload.kind)}`)
          }
          return builder
        },
        update: () => builder,
        eq: () => builder,
        in: () => builder,
        is: () => builder,
        or: () => builder,
        order: () => builder,
        maybeSingle: () => Promise.resolve(answer(table, state, scenario)),
        single: () => Promise.resolve(answer(table, state, scenario)),
        then: (
          onFulfilled: (value: { data: unknown; error: unknown }) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) => Promise.resolve(answer(table, state, scenario)).then(onFulfilled, onRejected),
      }
      return builder
    },
  } as unknown as SupabaseClient<Database>
}

function answer(
  table: string,
  state: { action: string; payload: Record<string, unknown> | null },
  scenario: Scenario
) {
  if (state.action === 'insert' && table === 'member_conversations') {
    return { data: { id: 'conversation-new' }, error: null }
  }
  if (state.action === 'insert') {
    return { data: { id: 'inserted' }, error: null }
  }
  if (table === 'member_profiles') {
    return {
      data: [REQUESTER, TARGET].map((id) => ({
        id,
        application_status:
          scenario.unapproved && id === REQUESTER ? 'submitted' : 'approved',
        messaging_suspended_at:
          scenario.suspended && id === TARGET ? '2026-10-01T00:00:00.000Z' : null,
      })),
      error: null,
    }
  }
  if (table === 'member_member_blocks') {
    return {
      data: scenario.blocked
        ? [{ blocker_id: REQUESTER, blocked_member_id: TARGET }]
        : [],
      error: null,
    }
  }
  if (table === 'profiles') {
    if (scenario.stripeStatus === 'error') {
      return { data: null, error: { message: 'identity lookup failed' } }
    }
    return {
      data: { identity_verification_status: scenario.stripeStatus ?? 'verified' },
      error: null,
    }
  }
  if (table === 'in_person_identity_verifications') {
    if (scenario.inPersonError) {
      return { data: null, error: { message: 'in-person lookup failed' } }
    }
    return { data: null, error: null }
  }
  if (table === 'member_conversations') {
    return { data: null, error: null }
  }
  if (table === 'curated_match_recommendations') {
    return {
      data: {
        id: RECOMMENDATION,
        recommended_user_id: TARGET,
        status: 'pending',
      },
      error: null,
    }
  }
  if (table === 'member_intro_requests') {
    return {
      data: scenario.existingIntroStatus
        ? { id: 'existing-intro', status: scenario.existingIntroStatus }
        : null,
      error: null,
    }
  }
  return { data: null, error: null }
}
