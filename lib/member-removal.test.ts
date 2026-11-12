import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { buildAdminMemberOverview } from '@/lib/admin/member-detail'
import {
  ACCOUNT_CHECK_UNAVAILABLE_MESSAGE,
  AUTH_UNBAN_FAILED_MESSAGE,
  FREE_RSVP_CANCELLATION_FAILED_MESSAGE,
  REMOVED_ACCOUNT_MESSAGE,
  REMOVED_APPLICATION_MESSAGE,
  RESTORE_AUTH_RECORD_FAILED_MESSAGE,
  RESTORE_CLEAR_FAILED_MESSAGE,
  RESTORE_EMAIL_FAILED_MESSAGE,
  RESTORE_RECORD_FAILED_MESSAGE,
  RESTORE_UNBAN_FAILED_MESSAGE,
  STRIPE_CANCELLATION_FAILED_MESSAGE,
  adminAttendeeLabel,
  adminRemovalFollowUp,
  applicationBlockForEmailLookup,
  directoryHidesRemovedMember,
  inboxWithoutRemovedMembers,
  memberFacingAttendeeRows,
  normalizeRemovedEmail,
  parseRemovalReason,
  restoreRecordAction,
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
    recordRemovalOutcome: vi.fn(async () => ({ ok: true as const })),
    discardRemoval: vi.fn(async () => ({ ok: true as const })),
    clearRemoved: vi.fn(async () => ({ ok: true as const })),
    recordRestore: vi.fn(async () => ({ ok: true as const })),
    recordAuthResult: vi.fn(async () => ({ ok: true as const })),
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

    expect(run.markRemoved).toHaveBeenCalledWith('member-1', {
      removedAt: NOW.toISOString(),
      removedBy: 'admin-1',
      category: 'Harassment',
      internalNote: NOTE,
      stripeResult: 'skipped',
      authResult: 'failed',
    })
    expect(run.recordRemovalOutcome).toHaveBeenCalledWith('member-1', {
      stripeResult: 'cancelled',
      authResult: 'banned',
    })
    expect(JSON.stringify(vi.mocked(run.recordRemovalOutcome).mock.calls)).not.toContain(
      NOTE
    )

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
    expect(run.recordRemovalOutcome).toHaveBeenCalledWith('member-1', {
      stripeResult: 'failed',
      authResult: 'banned',
    })
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
    expect(run.recordRestore).toHaveBeenCalledWith('member-1', {
      restoredAt: NOW.toISOString(),
      restoredBy: 'admin-1',
      restoreNote: 'Removed by mistake',
    })
    expect(run.recordAuthResult).toHaveBeenCalledWith('member-1', 'lifted')
    expect(run.clearRemoved).toHaveBeenCalledWith('member-1')
    const order = [
      vi.mocked(run.recordRestore).mock.invocationCallOrder[0],
      vi.mocked(run.deleteRemovedEmail).mock.invocationCallOrder[0],
      vi.mocked(run.unbanAuth).mock.invocationCallOrder[0],
      vi.mocked(run.recordAuthResult).mock.invocationCallOrder[0],
      vi.mocked(run.clearRemoved).mock.invocationCallOrder[0],
      vi.mocked(run.logRestore).mock.invocationCallOrder[0],
    ]
    expect(order).toEqual([...order].sort((left, right) => left - right))
    expect(run.discardRemoval).not.toHaveBeenCalled()
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

  it('finishes a restore retry after a failure at each step', async () => {
    const steps = ['record', 'email', 'unban', 'auth-record', 'clear'] as const
    const restoreInput = {
      actorIsAdmin: true,
      actorId: 'admin-1',
      targetUserId: 'member-1',
      note: 'Removed by mistake',
      confirmationText: 'RESTORE',
    }
    for (const step of steps) {
      let failedOnce = false
      let cleared = false
      const run = deps({
        loadTarget: async () => ({
          target: target({ removedAt: cleared ? null : NOW.toISOString() }),
          error: null,
        }),
        recordRestore: vi.fn(async () => {
          if (step === 'record' && !failedOnce) {
            failedOnce = true
            return { ok: false as const, error: RESTORE_RECORD_FAILED_MESSAGE }
          }
          return { ok: true as const }
        }),
        deleteRemovedEmail: vi.fn(async () => {
          if (step === 'email' && !failedOnce) {
            failedOnce = true
            return { ok: false as const, error: RESTORE_EMAIL_FAILED_MESSAGE }
          }
          return { ok: true as const }
        }),
        unbanAuth: vi.fn(async () => {
          if (step === 'unban' && !failedOnce) {
            failedOnce = true
            return 'failed' as const
          }
          return 'lifted' as const
        }),
        recordAuthResult: vi.fn(async (_userId, authResult) => {
          if (step === 'auth-record' && authResult === 'lifted' && !failedOnce) {
            failedOnce = true
            return { ok: false as const, error: RESTORE_AUTH_RECORD_FAILED_MESSAGE }
          }
          return { ok: true as const }
        }),
        clearRemoved: vi.fn(async () => {
          if (step === 'clear' && !failedOnce) {
            failedOnce = true
            return { ok: false as const, error: RESTORE_CLEAR_FAILED_MESSAGE }
          }
          cleared = true
          return { ok: true as const }
        }),
      })

      const first = await executeMemberRestore(restoreInput, run)
      expect(first.ok).toBe(false)
      if (!first.ok) expect(first.error).toMatch(/Try restore again/)
      expect(cleared).toBe(false)
      expect(JSON.stringify(first)).not.toMatch(/can sign in/i)

      const second = await executeMemberRestore(restoreInput, run)
      expect(second).toEqual({ ok: true, authBan: 'lifted' })
      expect(cleared).toBe(true)
    }
  })

  it('reports an unban failure without saying the member can sign in', async () => {
    const run = deps({
      loadTarget: async () => ({
        target: target({ removedAt: NOW.toISOString() }),
        error: null,
      }),
      unbanAuth: vi.fn(async () => 'failed' as const),
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
    expect(result).toEqual({ ok: false, error: RESTORE_UNBAN_FAILED_MESSAGE })
    expect(run.clearRemoved).not.toHaveBeenCalled()
    expect(run.logRestore).not.toHaveBeenCalled()
    expect(run.recordAuthResult).toHaveBeenCalledWith('member-1', 'unban_failed')
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
      authBan: 'unban_failed',
    })
    expect(overview.removalFollowUp).toEqual([AUTH_UNBAN_FAILED_MESSAGE])
    expect(overview.removalFollowUp.join(' ')).not.toMatch(/can sign in/i)
    expect(readFileSync(join(process.cwd(), 'components/admin/admin-permanent-member-removal.tsx'), 'utf8')).toContain(
      'if (\'error\' in result && result.error)'
    )
  })

  it('shows free RSVPs that still need cancellation after removal', async () => {
    const run = deps({
      cancelFreeRsvps: vi.fn(async () => ({
        ok: false as const,
        error: 'Free event RSVPs could not be cancelled.',
      })),
    })
    const result = await executePermanentRemoval(removalInput, run)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.freeRsvpsNeedingCancellation).toEqual([
      {
        eventId: 'event-free',
        eventTitle: 'Mixer',
        eventStartsAt: '2026-12-01T18:00:00.000Z',
      },
    ])
    expect(run.banAuth).toHaveBeenCalled()
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
      freeRsvpsNeedingCancellation: result.freeRsvpsNeedingCancellation,
    })
    expect(overview.removalFollowUp).toEqual([
      `${FREE_RSVP_CANCELLATION_FAILED_MESSAGE}: Mixer.`,
    ])
    expect(
      readFileSync(join(process.cwd(), 'app/(club)/admin/users/[id]/page.tsx'), 'utf8')
    ).toContain('followUp={overview.removalFollowUp}')
  })

  it('treats an already written restore record as finished', () => {
    expect(restoreRecordAction(null)).toBe('missing')
    expect(restoreRecordAction({ restoredAt: null })).toBe('write')
    expect(restoreRecordAction({ restoredAt: NOW.toISOString() })).toBe('already_done')
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
      removalCategory: 'Other',
      stripeCancellation: 'failed',
      authBan: 'banned',
    })
    expect(overview.removed).toBe(true)
    expect(overview.removalCategory).toBe('Other')
    expect(overview.removalFollowUp).toEqual([STRIPE_CANCELLATION_FAILED_MESSAGE])
    const serialized = JSON.stringify(overview)
    expect(serialized).not.toContain(NOTE)
    expect(serialized).not.toContain('internal_note')
    expect(serialized).not.toContain('removal_reason')
    const detail = readFileSync(join(process.cwd(), 'lib/admin/member-detail.ts'), 'utf8')
    expect(detail).toContain(".select('reason_category, stripe_result, auth_result')")
    expect(detail).not.toMatch(
      /from\('member_removal_records'\)[\s\S]{0,240}internal_note/
    )
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

  it('keeps removal records off member-facing queries, views, and responses', () => {
    const root = process.cwd()
    const allowed = new Set([
      'lib/member-removal-db.ts',
      'lib/admin/member-detail.ts',
      'lib/database.types.ts',
      'lib/member-removal.test.ts',
      'supabase/migrations/20261111203000_member_permanent_removal.sql',
    ])
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === '.next' || entry === '.git') continue
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
          walk(full)
          continue
        }
        if (!/\.(ts|tsx|sql)$/.test(entry)) continue
        const relative = full.slice(root.length + 1)
        if (allowed.has(relative)) continue
        const source = readFileSync(full, 'utf8')
        if (source.includes('member_removal_records')) hits.push(relative)
      }
    }
    walk(root)
    expect(hits).toEqual([])

    const sql = readFileSync(
      join(root, 'supabase/migrations/20261111203000_member_permanent_removal.sql'),
      'utf8'
    )
    const view = sql.slice(sql.indexOf('create view public.member_profiles'))
    expect(view).not.toContain('member_removal_records')
    expect(view).toContain('removed_at')
    expect(readFileSync(join(root, 'lib/member-removal-run.ts'), 'utf8')).not.toContain(
      'member_removal_records'
    )
  })

  it('does not use a column-level revoke for removal fields', () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        'supabase/migrations/20261111203000_member_permanent_removal.sql'
      ),
      'utf8'
    )
    expect(sql.toLowerCase()).not.toContain('revoke select (')
    expect(sql).not.toContain('add column if not exists removed_by')
    expect(sql).not.toContain('add column if not exists removal_reason')
    expect(sql).toContain('create table if not exists public.member_removal_records')
    expect(sql).toContain('public.is_admin(auth.uid())')
  })
})
