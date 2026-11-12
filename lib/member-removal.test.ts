import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { buildAdminMemberOverview } from '@/lib/admin/member-detail'
import {
  ACCOUNT_CHECK_UNAVAILABLE_MESSAGE,
  REMOVED_ACCOUNT_MESSAGE,
  REMOVED_APPLICATION_MESSAGE,
  STRIPE_CANCELLATION_FAILED_MESSAGE,
  adminAttendeeLabel,
  adminRemovalFollowUp,
  applicationBlockForEmailLookup,
  directoryHidesRemovedMember,
  inboxWithoutRemovedMembers,
  memberFacingAttendeeRows,
  normalizeRemovedEmail,
  parseRemovalReason,
  visibleMatchCandidateIds,
} from '@/lib/member-removal'
import {
  executeMemberRestore,
  executePermanentRemoval,
  publicRemovalResult,
  type RemovalRunDeps,
} from '@/lib/member-removal-run'

const NOTE = 'NOTE-SECRET-8841'
const NOW = new Date('2026-11-11T18:00:00.000Z')

function target(overrides: Record<string, unknown> = {}) {
  return {
    id: 'member-1',
    email: '  Person@Example.com ',
    role: 'member',
    removedAt: null,
    messagingSuspendedAt: null,
    membershipBilling: {
      subscription_status: 'active',
      stripe_subscription_id: 'sub_123',
    },
    ...overrides,
  }
}

function attendance() {
  return {
    ok: true as const,
    attendees: [
      {
        id: 'free-rsvp',
        event_id: 'event-free',
        status: 'going',
        payment_status: null,
        amount_paid_cents: 0,
      },
      {
        id: 'paid-rsvp',
        event_id: 'event-paid',
        status: 'going',
        payment_status: 'paid',
        amount_paid_cents: 2500,
      },
      {
        id: 'past-rsvp',
        event_id: 'event-past',
        status: 'going',
        payment_status: null,
        amount_paid_cents: 0,
      },
    ],
    events: [
      {
        id: 'event-free',
        title: 'Mixer',
        starts_at: '2026-12-01T18:00:00.000Z',
        fee_cents: 0,
      },
      {
        id: 'event-paid',
        title: 'Gala',
        starts_at: '2026-12-02T18:00:00.000Z',
        fee_cents: 2500,
      },
      {
        id: 'event-past',
        title: 'Last month',
        starts_at: '2026-10-01T18:00:00.000Z',
        fee_cents: 0,
      },
    ],
  }
}

function deps(overrides: Partial<RemovalRunDeps> = {}): RemovalRunDeps {
  return {
    now: () => NOW,
    loadTarget: async () => ({ target: target(), error: null }),
    markRemoved: vi.fn(async () => ({ ok: true as const })),
    clearRemoved: vi.fn(async () => ({ ok: true as const })),
    saveRemovedEmail: vi.fn(async () => ({ ok: true as const })),
    deleteRemovedEmail: vi.fn(async () => ({ ok: true as const })),
    suspendMessaging: vi.fn(async () => ({ ok: true as const })),
    loadUpcomingAttendance: async () => attendance(),
    cancelFreeRsvps: vi.fn(async () => ({ ok: true as const })),
    cancelSubscription: vi.fn(async () => 'cancelled' as const),
    banAuth: vi.fn(async () => 'banned' as const),
    unbanAuth: vi.fn(async () => 'lifted' as const),
    logRemoval: vi.fn(async () => ({ ok: true as const })),
    logRestore: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  }
}

const removalInput = {
  actorIsAdmin: true,
  actorId: 'admin-1',
  targetUserId: 'member-1',
  category: 'Harassment',
  internalNote: NOTE,
  confirmationText: 'REMOVE',
}

describe('permanent member removal', () => {
  it('rejects non-admins, self removal, and other admins', async () => {
    const nonAdmin = deps()
    const denied = await executePermanentRemoval(
      { ...removalInput, actorIsAdmin: false },
      nonAdmin
    )
    expect(denied).toEqual({ ok: false, error: 'Administrator access required.' })
    expect(nonAdmin.markRemoved).not.toHaveBeenCalled()

    const self = deps({
      loadTarget: async () => ({
        target: target({ id: 'admin-1', role: 'member' }),
        error: null,
      }),
    })
    const selfResult = await executePermanentRemoval(
      { ...removalInput, targetUserId: 'admin-1' },
      self
    )
    expect(selfResult).toEqual({
      ok: false,
      error: 'You cannot remove your own account.',
    })
    expect(self.markRemoved).not.toHaveBeenCalled()

    const otherAdmin = deps({
      loadTarget: async () => ({
        target: target({ role: 'admin' }),
        error: null,
      }),
    })
    const adminResult = await executePermanentRemoval(removalInput, otherAdmin)
    expect(adminResult).toEqual({
      ok: false,
      error: 'Administrator accounts cannot be removed.',
    })
    expect(otherAdmin.banAuth).not.toHaveBeenCalled()

    const restore = deps()
    const restoreDenied = await executeMemberRestore(
      {
        actorIsAdmin: false,
        actorId: 'member-2',
        targetUserId: 'member-1',
        note: 'Mistake',
        confirmationText: 'RESTORE',
      },
      restore
    )
    expect(restoreDenied).toEqual({
      ok: false,
      error: 'Administrator access required.',
    })
    expect(restore.clearRemoved).not.toHaveBeenCalled()
  })

  it('removes the member, blocks the email, and records the category only', async () => {
    const run = deps()
    const result = await executePermanentRemoval(removalInput, run)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.paidTickets).toEqual([
      {
        eventId: 'event-paid',
        eventTitle: 'Gala',
        eventStartsAt: '2026-12-02T18:00:00.000Z',
        amountCents: 2500,
      },
    ])
    expect(result.stripeCancellation).toBe('cancelled')
    expect(result.authBan).toBe('banned')
    expect(result.messagingSuspended).toBe(true)
    expect(JSON.stringify(publicRemovalResult(result))).not.toContain(NOTE)
    expect(JSON.stringify(result)).not.toContain(NOTE)

    expect(run.markRemoved).toHaveBeenCalled()
    const marked = vi.mocked(run.markRemoved).mock.calls.at(-1)?.[1]
    expect(marked?.removedBy).toBe('admin-1')
    expect(marked?.removedAt).toBe(NOW.toISOString())
    expect(marked?.removalReason).toContain('Harassment')

    expect(run.saveRemovedEmail).toHaveBeenCalledWith({
      emailNormalized: 'person@example.com',
      profileId: 'member-1',
      removedAt: NOW.toISOString(),
      removedBy: 'admin-1',
    })
    expect(run.suspendMessaging).toHaveBeenCalledWith('member-1', 'Harassment')
    expect(run.cancelFreeRsvps).toHaveBeenCalledWith(
      ['free-rsvp'],
      NOW.toISOString()
    )
    expect(run.cancelSubscription).toHaveBeenCalled()
    expect(run.banAuth).toHaveBeenCalledWith('member-1')
    expect(run.logRemoval).toHaveBeenCalledWith({
      actorId: 'admin-1',
      targetId: 'member-1',
      category: 'Harassment',
    })
    expect(JSON.stringify(vi.mocked(run.logRemoval).mock.calls)).not.toContain(NOTE)
    expect(JSON.stringify(vi.mocked(run.suspendMessaging).mock.calls)).not.toContain(
      NOTE
    )
  })

  it('still removes the member when Stripe cancellation fails', async () => {
    const run = deps({
      cancelSubscription: vi.fn(async () => 'failed' as const),
    })
    const result = await executePermanentRemoval(removalInput, run)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.stripeCancellation).toBe('failed')
    expect(run.banAuth).toHaveBeenCalled()
    expect(run.saveRemovedEmail).toHaveBeenCalled()
    expect(adminRemovalFollowUp(result)).toEqual([
      STRIPE_CANCELLATION_FAILED_MESSAGE,
    ])
    expect(JSON.stringify(adminRemovalFollowUp(result))).not.toContain('cus_')
    expect(JSON.stringify(adminRemovalFollowUp(result))).not.toContain(NOTE)
  })

  it('hides removed members from member-facing lists and labels them in admin views', () => {
    const removed = new Set(['member-1'])
    expect(
      memberFacingAttendeeRows(
        [{ user_id: 'member-1' }, { user_id: 'member-2' }],
        removed,
        false
      )
    ).toEqual([{ user_id: 'member-2' }])
    expect(
      memberFacingAttendeeRows(
        [{ user_id: 'member-1' }, { user_id: 'member-2' }],
        removed,
        true
      )
    ).toHaveLength(2)
    expect(adminAttendeeLabel('Alex', 'member-1', removed, true)).toBe(
      'Alex (Removed)'
    )
    expect(adminAttendeeLabel('Alex', 'member-1', removed, false)).toBe('Alex')
    expect(
      inboxWithoutRemovedMembers(
        [
          { otherUserId: 'member-1', conversationId: 'c1' },
          { otherUserId: 'member-2', conversationId: 'c2' },
        ],
        removed
      )
    ).toEqual([{ otherUserId: 'member-2', conversationId: 'c2' }])
    expect(
      visibleMatchCandidateIds(
        ['member-1', 'member-2'],
        removed,
        new Set(['member-1', 'member-2'])
      )
    ).toEqual(new Set(['member-2']))
    expect(directoryHidesRemovedMember('2026-11-11T18:00:00.000Z')).toBe(true)
    expect(directoryHidesRemovedMember(null)).toBe(false)
  })

  it('blocks removed emails without saying the account was removed', async () => {
    const lookups: string[] = []
    const blocked = await applicationBlockForEmailLookup(
      '  Person@Example.com ',
      async (normalized) => {
        lookups.push(normalized)
        return { status: 'blocked' }
      }
    )
    expect(lookups).toEqual(['person@example.com'])
    expect(blocked).toBe(REMOVED_APPLICATION_MESSAGE)
    expect(blocked).not.toMatch(/remov/i)

    const spaced = await applicationBlockForEmailLookup(
      'PERSON@example.com',
      async () => ({ status: 'blocked' })
    )
    expect(spaced).toBe(REMOVED_APPLICATION_MESSAGE)
    expect(normalizeRemovedEmail('  PERSON@example.com  ')).toBe(
      'person@example.com'
    )

    const unavailable = await applicationBlockForEmailLookup(
      'person@example.com',
      async () => ({ status: 'unavailable' })
    )
    expect(unavailable).toBe(ACCOUNT_CHECK_UNAVAILABLE_MESSAGE)
    expect(unavailable).not.toBe(REMOVED_APPLICATION_MESSAGE)

    let called = false
    const empty = await applicationBlockForEmailLookup('   ', async () => {
      called = true
      return { status: 'blocked' }
    })
    expect(empty).toBeNull()
    expect(called).toBe(false)
  })

  it('restores sign-in and the email block without restoring messaging, billing, or RSVPs', async () => {
    const run = deps({
      loadTarget: async () => ({
        target: target({ removedAt: NOW.toISOString() }),
        error: null,
      }),
    })
    const result = await executeMemberRestore(
      {
        actorIsAdmin: true,
        actorId: 'admin-1',
        targetUserId: 'member-1',
        note: 'Removed by mistake',
        confirmationText: 'RESTORE',
      },
      run
    )
    expect(result).toEqual({ ok: true, authBan: 'lifted' })
    expect(run.clearRemoved).toHaveBeenCalledWith('member-1')
    expect(run.deleteRemovedEmail).toHaveBeenCalledWith('person@example.com')
    expect(run.unbanAuth).toHaveBeenCalledWith('member-1')
    expect(run.logRestore).toHaveBeenCalledWith({
      actorId: 'admin-1',
      targetId: 'member-1',
      note: 'Removed by mistake',
    })
    expect(run.suspendMessaging).not.toHaveBeenCalled()
    expect(run.cancelSubscription).not.toHaveBeenCalled()
    expect(run.cancelFreeRsvps).not.toHaveBeenCalled()
    expect(run.banAuth).not.toHaveBeenCalled()
  })

  it('keeps the internal note out of member-facing removal data', () => {
    const stored = JSON.stringify({
      category: 'Other',
      note: NOTE,
      stripeCancellation: 'failed',
      authBan: 'banned',
    })
    const parsed = parseRemovalReason(stored)
    expect(parsed).toEqual({
      category: 'Other',
      stripeCancellation: 'failed',
      authBan: 'banned',
    })
    expect(JSON.stringify(parsed)).not.toContain(NOTE)

    const overview = buildAdminMemberOverview({
      id: 'member-1',
      email: 'alex@example.com',
      fullName: 'Alex',
      role: 'member',
      applicationStatus: 'approved',
      membershipIntent: null,
      locationArea: null,
      locationCity: null,
      connectionIntents: null,
      connectionsOpenTo: null,
      discoveryIntent: null,
      identityVerificationStatus: 'not_started',
      identityVerifiedAt: null,
      membershipBilling: { tier: 'member', subscription_status: 'none' },
      messagingSuspendedAt: null,
      messagingSuspensionReason: null,
      profileRevisionStatus: null,
      applicationDraft: null,
      accessOverride: null,
      removedAt: NOW.toISOString(),
      removalReason: stored,
    })
    expect(overview.removed).toBe(true)
    expect(overview.removalCategory).toBe('Other')
    expect(overview.removalFollowUp).toEqual([STRIPE_CANCELLATION_FAILED_MESSAGE])
    const serialized = JSON.stringify(overview)
    expect(serialized).not.toContain(NOTE)
    expect(serialized).not.toContain('removal_reason')
    expect(REMOVED_ACCOUNT_MESSAGE).not.toContain('—')
    expect(REMOVED_APPLICATION_MESSAGE).not.toContain('—')
  })

  it('wires hiding, the removed label, and the neutral blocks into the app', () => {
    const root = process.cwd()
    const read = (path: string) => readFileSync(join(root, path), 'utf8')
    expect(read('lib/load-directory-profiles.ts')).toContain(".is('removed_at', null)")
    expect(read('lib/matching-identity.ts')).toContain('visibleMatchCandidateIds')
    expect(read('lib/member-messages.ts')).toContain('inboxWithoutRemovedMembers')
    expect(read('app/(club)/events/[id]/page.tsx')).toContain('memberFacingAttendeeRows')
    expect(read('app/(club)/admin/users/page.tsx')).toContain('Removed')
    expect(read('components/admin/admin-permanent-member-removal.tsx')).toContain(
      'Needs refund decision'
    )
    expect(read('components/admin/admin-permanent-member-removal.tsx')).not.toContain('—')
    expect(read('components/account/inactive-account.tsx')).toContain(
      'REMOVED_ACCOUNT_MESSAGE'
    )
    expect(read('app/signup/actions.ts')).toContain('removedApplicationBlock')
    expect(read('app/(club)/application/actions.ts')).toContain(
      'removedApplicationBlock'
    )
    expect(read('supabase/migrations/20261111203000_member_permanent_removal.sql')).toContain(
      'removed_member_emails'
    )
  })
})
