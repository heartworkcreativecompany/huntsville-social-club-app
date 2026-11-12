import type { SupabaseClient } from '@supabase/supabase-js'
import { captureOperationalError } from '@/lib/capture-error'
import type { Database } from '@/lib/database.types'
import { suspendMemberMessaging } from '@/lib/message-report-moderation'
import {
  applicationBlockForEmailLookup,
  AUTH_BAN_DURATION,
  isRemovalReasonCategory,
} from '@/lib/member-removal'
import type { RemovalRunDeps } from '@/lib/member-removal-run'
import {
  parseMembershipBilling,
  stripeSubscriptionBlocksNewCheckout,
} from '@/lib/membership-systems'
import { logModerationAction } from '@/lib/moderation-actions'
import { isMissingSchemaColumnError } from '@/lib/profile-query-fields'
import { getStripe, isStripeConfigured } from '@/lib/stripe/config'
import {
  splitUpcomingRsvps,
  type PaidTicketDecision,
  type StripeCancellationState,
} from '@/lib/member-removal'
import { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = SupabaseClient<Database>

export async function cancelRemovedMemberSubscription(
  billing: unknown
): Promise<StripeCancellationState> {
  const parsed = parseMembershipBilling(billing)
  if (!stripeSubscriptionBlocksNewCheckout(parsed)) {
    return 'skipped'
  }

  const subscriptionId = parsed.stripe_subscription_id?.trim()
  if (!subscriptionId || !isStripeConfigured()) {
    captureOperationalError(
      'member-removal-stripe',
      new Error('Membership subscription cancellation failed.')
    )
    return 'failed'
  }

  try {
    const stripe = getStripe()
    await stripe.subscriptions.cancel(subscriptionId, {
      prorate: false,
      invoice_now: false,
    })
    return 'cancelled'
  } catch {
    captureOperationalError(
      'member-removal-stripe',
      new Error('Membership subscription cancellation failed.')
    )
    return 'failed'
  }
}

export async function banAuthUser(
  admin: AdminClient,
  userId: string
): Promise<'banned' | 'failed'> {
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: AUTH_BAN_DURATION,
  })
  if (error) {
    captureOperationalError('member-removal-auth', new Error('Auth ban failed.'))
    return 'failed'
  }
  return 'banned'
}

export async function unbanAuthUser(
  admin: AdminClient,
  userId: string
): Promise<'lifted' | 'failed'> {
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: 'none',
  })
  if (error) {
    captureOperationalError('member-removal-auth', new Error('Auth ban lift failed.'))
    return 'failed'
  }
  return 'lifted'
}

export function buildRemovalDeps(
  admin: AdminClient,
  actorId: string
): RemovalRunDeps {
  return {
    now: () => new Date(),
    loadTarget: async (userId) => {
      const { data, error } = await admin
        .from('profiles')
        .select(
          'id, email, role, removed_at, messaging_suspended_at, membership_billing'
        )
        .eq('id', userId)
        .maybeSingle()
      if (error) return { target: null, error: 'Member not found.' }
      if (!data) return { target: null, error: null }
      return {
        target: {
          id: data.id,
          email: data.email,
          role: data.role,
          removedAt: data.removed_at,
          messagingSuspendedAt: data.messaging_suspended_at,
          membershipBilling: data.membership_billing,
        },
        error: null,
      }
    },
    markRemoved: async (userId, patch) => {
      const { error } = await admin
        .from('profiles')
        .update({
          removed_at: patch.removedAt,
          removed_by: patch.removedBy,
          removal_reason: patch.removalReason,
          updated_at: patch.removedAt,
        })
        .eq('id', userId)
      if (error) return { ok: false, error: 'The member could not be removed.' }
      return { ok: true }
    },
    clearRemoved: async (userId) => {
      const { error } = await admin
        .from('profiles')
        .update({
          removed_at: null,
          removed_by: null,
          removal_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
      if (error) return { ok: false, error: 'The member could not be restored.' }
      return { ok: true }
    },
    saveRemovedEmail: async (input) => {
      const { error } = await admin.from('removed_member_emails').upsert(
        {
          email_normalized: input.emailNormalized,
          profile_id: input.profileId,
          removed_at: input.removedAt,
          removed_by: input.removedBy,
        },
        { onConflict: 'email_normalized' }
      )
      if (error) {
        return { ok: false, error: 'The member could not be removed.' }
      }
      return { ok: true }
    },
    deleteRemovedEmail: async (emailNormalized) => {
      const { error } = await admin
        .from('removed_member_emails')
        .delete()
        .eq('email_normalized', emailNormalized)
      if (error) return { ok: false, error: 'The member could not be restored.' }
      return { ok: true }
    },
    suspendMessaging: async (targetId, category) => {
      if (!isRemovalReasonCategory(category)) {
        return { ok: false, error: 'Choose a reason category.' }
      }
      return suspendMemberMessaging(admin, {
        actorId,
        targetMemberId: targetId,
        adminNotes: category,
      })
    },
    loadUpcomingAttendance: async (userId) => {
      const { data: attendees, error } = await admin
        .from('event_attendees')
        .select('id, event_id, status, payment_status, amount_paid_cents')
        .eq('user_id', userId)
        .in('status', ['going', 'maybe'])
      if (error) return { ok: false, error: 'Event RSVPs could not be loaded.' }
      const eventIds = [...new Set((attendees ?? []).map((row) => row.event_id))]
      if (eventIds.length === 0) {
        return { ok: true, attendees: attendees ?? [], events: [] }
      }
      const { data: events, error: eventError } = await admin
        .from('events')
        .select('id, title, starts_at, fee_cents')
        .in('id', eventIds)
      if (eventError) return { ok: false, error: 'Event RSVPs could not be loaded.' }
      return { ok: true, attendees: attendees ?? [], events: events ?? [] }
    },
    cancelFreeRsvps: async (attendeeIds, cancelledAt) => {
      const { error } = await admin
        .from('event_attendees')
        .update({
          status: 'not_going',
          cancelled_at: cancelledAt,
          updated_at: cancelledAt,
        })
        .in('id', attendeeIds)
      if (error) return { ok: false, error: 'Free event RSVPs could not be cancelled.' }
      return { ok: true }
    },
    cancelSubscription: (billing) => cancelRemovedMemberSubscription(billing),
    banAuth: (userId) => banAuthUser(admin, userId),
    unbanAuth: (userId) => unbanAuthUser(admin, userId),
    logRemoval: async ({ actorId, targetId, category }) => {
      const logged = await logModerationAction(admin, {
        actorId,
        targetMemberId: targetId,
        actionType: 'member_removed',
        reason: category,
        details: 'Member permanently removed.',
      })
      if (!logged.ok) {
        captureOperationalError(
          'member-removal-audit',
          new Error('Removal audit log failed.')
        )
      }
      return { ok: true }
    },
    logRestore: async ({ actorId, targetId, note }) => {
      const logged = await logModerationAction(admin, {
        actorId,
        targetMemberId: targetId,
        actionType: 'member_restored',
        reason: note,
        details: 'Member removal was reversed. Messaging, subscription, and RSVPs were not restored.',
      })
      if (!logged.ok) {
        captureOperationalError(
          'member-removal-audit',
          new Error('Restore audit log failed.')
        )
      }
      return { ok: true }
    },
  }
}

export async function removedApplicationBlock(
  admin: AdminClient | null,
  email: string | null | undefined
): Promise<string | null> {
  return applicationBlockForEmailLookup(email, async (normalized) => {
    if (!admin) return { status: 'unavailable' }
    const { data, error } = await admin
      .from('removed_member_emails')
      .select('id')
      .eq('email_normalized', normalized)
      .maybeSingle()
    if (error) {
      if (error.code === '42P01' || isMissingSchemaColumnError(error)) {
        return { status: 'clear' }
      }
      captureOperationalError(
        'removed-email-check',
        new Error('Removed email lookup failed.')
      )
      return { status: 'unavailable' }
    }
    return data ? { status: 'blocked' } : { status: 'clear' }
  })
}

export async function loadPaidRefundDecisions(
  admin: AdminClient,
  userId: string
): Promise<PaidTicketDecision[]> {
  const { data: attendees, error } = await admin
    .from('event_attendees')
    .select('id, event_id, status, payment_status, amount_paid_cents')
    .eq('user_id', userId)
    .in('status', ['going', 'maybe'])
  if (error || !attendees?.length) return []
  const eventIds = [...new Set(attendees.map((row) => row.event_id))]
  const { data: events, error: eventError } = await admin
    .from('events')
    .select('id, title, starts_at, fee_cents')
    .in('id', eventIds)
  if (eventError || !events) return []
  const eventsById = new Map(
    events.map((event) => [
      event.id,
      {
        starts_at: event.starts_at,
        title: event.title,
        fee_cents: event.fee_cents,
      },
    ])
  )
  return splitUpcomingRsvps(attendees, eventsById, new Date()).paidTickets
}

export async function loadRemovedMemberIds(
  userIds: string[]
): Promise<Set<string>> {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (ids.length === 0) return new Set()
  const admin = createAdminClient()
  if (!admin) return new Set()
  const { data, error } = await admin
    .from('profiles')
    .select('id, removed_at')
    .in('id', ids)
  if (error || !data) return new Set()
  return new Set(
    data.filter((row) => row.removed_at != null).map((row) => row.id)
  )
}
