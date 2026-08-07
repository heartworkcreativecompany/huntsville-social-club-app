'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isApprovedMember } from '@/lib/application'
import {
  appendRegistrationLedger,
  consumeEventCredit,
  loadActiveEntitlementCycle,
  returnEventCredit,
  returnGuestInvite,
} from '@/lib/membership-billing-cycles'
import {
  buildMemberEntitlements,
  evaluateEventRegistration,
} from '@/lib/membership-entitlements'
import {
  EVENT_AT_CAPACITY_MESSAGE,
  isEventAtCapacity,
} from '@/lib/event-attendance'
import type { EventAccessType } from '@/lib/membership-tier-config'
import {
  isConfirmedGoingAttendee,
  resolveRsvpCancelRefund,
  shouldUseEventFeeCheckout,
} from '@/lib/event-rsvp-going'
import type { MembershipPerksSnapshot } from '@/lib/event-rsvp-window'
import { createEventFeeCheckoutSession } from '@/lib/stripe/event-fee-checkout'
import { getViewer } from '@/lib/viewer'

export type RsvpStatus = 'going' | 'maybe' | 'not_going'

type EventRow = {
  id: string
  starts_at: string
  status: string | null
  event_type: string | null
  title?: string | null
  fee_cents?: number | null
  attendance_max?: number | null
}

type AttendeeRow = {
  status: string
  registration_method: string | null
  payment_status: string | null
  entitlement_cycle_id: string | null
  credit_consumed: boolean | null
  credit_returned: boolean | null
  guest_name: string | null
  guest_invite_consumed: boolean | null
}

async function requireEntitledViewer() {
  const viewer = await getViewer()
  if (!viewer) {
    return { error: 'You must be signed in.' as const }
  }

  if (!isApprovedMember(viewer.applicationStatus, viewer.role)) {
    return { error: 'Membership approval is required.' as const }
  }

  const supabase = await createClient()
  const activeCycle = await loadActiveEntitlementCycle(supabase, viewer.userId)
  const entitlements = buildMemberEntitlements({
    role: viewer.role,
    billing: viewer.profile?.membership_billing,
    applicationApproved: true,
    activeCycle,
  })

  return { viewer, supabase, entitlements }
}

async function loadMembershipPerksSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  viewer: NonNullable<Awaited<ReturnType<typeof getViewer>>>,
  applicationApproved = true
): Promise<MembershipPerksSnapshot> {
  const activeCycle = await loadActiveEntitlementCycle(supabase, viewer.userId)
  const entitlements = buildMemberEntitlements({
    role: viewer.role,
    billing: viewer.profile?.membership_billing,
    applicationApproved,
    activeCycle,
  })

  return perksFromEntitlements(entitlements)
}

function perksFromEntitlements(entitlements: {
  productTier: MembershipPerksSnapshot['productTier']
  premiumCreditsRemaining: number | null
  guestInvitesRemaining: number
  activeCycle: {
    credits_granted: number | null
    period_start?: string | null
    period_end?: string | null
  } | null
}): MembershipPerksSnapshot {
  const hasPaidMembership =
    entitlements.productTier === 'inner_circle' ||
    entitlements.productTier === 'elite_circle'
  return {
    productTier: entitlements.productTier,
    hasPaidMembership,
    premiumCreditsRemaining: hasPaidMembership
      ? (entitlements.premiumCreditsRemaining ?? 0)
      : 0,
    creditsGranted: hasPaidMembership
      ? (entitlements.activeCycle?.credits_granted ?? null)
      : 0,
    guestInvitesRemaining: hasPaidMembership
      ? entitlements.guestInvitesRemaining
      : 0,
    periodStart: hasPaidMembership
      ? (entitlements.activeCycle?.period_start ?? null)
      : null,
    periodEnd: hasPaidMembership
      ? (entitlements.activeCycle?.period_end ?? null)
      : null,
  }
}

export async function updateEventRsvp(input: {
  eventId: string
  status: RsvpStatus
  registrationPreference?: 'included' | 'paid'
}) {
  const auth = await requireEntitledViewer()
  if ('error' in auth && auth.error) {
    return { error: auth.error }
  }

  const { viewer, supabase, entitlements } = auth
  const userId = viewer.userId

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select(
      'id, title, starts_at, status, event_type, fee_cents, priority_rsvp_opens_at, general_rsvp_opens_at, attendance_max'
    )
    .eq('id', input.eventId)
    .single()

  if (eventError || !event) {
    return { error: eventError?.message ?? 'Event not found.' }
  }

  const eventRow = event as EventRow & {
    priority_rsvp_opens_at?: string | null
    general_rsvp_opens_at?: string | null
    attendance_max?: number | null
  }
  const eventType = (eventRow.event_type ?? 'standard_event') as EventAccessType
  const isGoing = input.status === 'going'

  const { data: existing } = await supabase
    .from('event_attendees')
    .select(
      'status, registration_method, payment_status, entitlement_cycle_id, credit_consumed, credit_returned, guest_name, guest_invite_consumed'
    )
    .eq('event_id', input.eventId)
    .eq('user_id', userId)
    .maybeSingle()

  const existingRow = existing as AttendeeRow | null
  // Legacy unpaid placeholders used status=going + payment_status=pending.
  // Those must not skip Checkout on a later Going click.
  const wasGoing = isConfirmedGoingAttendee(existingRow)
  const hasUnpaidGoingPlaceholder =
    existingRow?.status === 'going' && existingRow.payment_status === 'pending'
  const leavingGoing =
    !isGoing && (wasGoing || hasUnpaidGoingPlaceholder)

  // Changing away from Going never refunds premium credits or event fees.
  if (leavingGoing) {
    const refund = resolveRsvpCancelRefund()
    await appendRegistrationLedger(supabase, {
      userId,
      eventId: input.eventId,
      action: 'cancel',
      registrationMethod: existingRow?.registration_method ?? null,
      entitlementCycleId: existingRow?.entitlement_cycle_id ?? null,
      creditDelta: refund.creditDelta,
      metadata: {
        reason: 'rsvp_changed_no_refund',
        previous_status: existingRow?.status ?? 'going',
        next_status: input.status,
        registration_method: existingRow?.registration_method ?? null,
        payment_status: existingRow?.payment_status ?? null,
        credit_consumed: existingRow?.credit_consumed ?? false,
        refund_credit: refund.refundCredit,
        refund_payment: refund.refundPayment,
      },
    })
  }

  // Cancelling Going also returns a spent guest invite to the active cycle.
  // (Guest invites are not membership credits or event fees.)
  if (leavingGoing && existingRow?.guest_invite_consumed) {
    const cycleId =
      existingRow.entitlement_cycle_id ?? entitlements.activeCycle?.id ?? null
    if (cycleId) {
      await returnGuestInvite(supabase, cycleId)
      await appendRegistrationLedger(supabase, {
        userId,
        eventId: input.eventId,
        action: 'guest_invite_return',
        entitlementCycleId: cycleId,
        creditDelta: 0,
        metadata: {
          reason: 'rsvp_cancelled',
          guest_name: existingRow.guest_name,
        },
      })
    }
  }

  if (isGoing && !wasGoing) {
    const { data: goingRows, error: countError } = await supabase
      .from('event_attendees')
      .select('user_id, payment_status')
      .eq('event_id', input.eventId)
      .eq('status', 'going')

    if (countError) {
      return { error: countError.message }
    }

    const goingCount = (goingRows ?? []).filter((row) =>
      isConfirmedGoingAttendee(row)
    ).length

    if (isEventAtCapacity(goingCount, eventRow.attendance_max)) {
      return { error: EVENT_AT_CAPACITY_MESSAGE }
    }

    const decision = evaluateEventRegistration({
      entitlements,
      eventType,
      eventStatus: eventRow.status,
      isGoingRsvp: true,
      registrationPreference: input.registrationPreference,
      priorityRsvpOpensAt: eventRow.priority_rsvp_opens_at,
      generalRsvpOpensAt: eventRow.general_rsvp_opens_at,
    })

    if (!decision.allowed) {
      return {
        error: decision.message,
        code: decision.code,
        upgradeTier: decision.upgradeTier,
      }
    }

    // Paid registration: start Stripe Checkout and only mark Going after webhook.
    // Free members on premium events with a fee always take this path.
    if (
      shouldUseEventFeeCheckout({
        eventType,
        feeCents: eventRow.fee_cents,
        productTier: entitlements.productTier,
        decision,
      })
    ) {
      const feeCents = eventRow.fee_cents ?? 0
      const checkout = await createEventFeeCheckoutSession({
        supabase,
        eventId: input.eventId,
        eventTitle: eventRow.title?.trim() || 'Event registration',
        feeCents,
        userId,
        email: viewer.email,
      })

      if ('error' in checkout) {
        return { error: checkout.error }
      }

      // Clear legacy unpaid Going placeholders so UI/capacity stay honest
      // until checkout.session.completed confirms payment.
      if (hasUnpaidGoingPlaceholder && existingRow) {
        await supabase
          .from('event_attendees')
          .update({
            status: 'not_going',
            payment_status: 'pending',
            registration_method: 'paid_per_event',
            cancelled_at: new Date().toISOString(),
          })
          .eq('event_id', input.eventId)
          .eq('user_id', userId)
      }

      await appendRegistrationLedger(supabase, {
        userId,
        eventId: input.eventId,
        action: 'payment_required',
        registrationMethod: 'paid_per_event',
        creditDelta: 0,
        metadata: {
          payment_status: 'pending',
          stripe_checkout_session_id: checkout.sessionId,
          fee_cents: feeCents,
          product_tier: entitlements.productTier,
          decision_method: decision.allowed ? decision.method : null,
        },
      })

      return {
        success: true as const,
        decision,
        checkoutUrl: checkout.url,
        usedCredit: false as const,
        perks: perksFromEntitlements(entitlements),
      }
    }

    let registrationMethod = decision.method
    let paymentStatus: string | null = null
    let entitlementCycleId: string | null = null
    let creditConsumed = false
    let consumedCreditsRemaining: number | null = null
    let consumedCreditsGranted: number | null = null

    if (decision.method === 'paid_per_event') {
      // Fee missing/zero — never grant free Going on a paid decision.
      return {
        error: 'This event does not have a registration fee configured.',
      }
    }

    if (decision.method === 'credit') {
      if (!entitlements.activeCycle?.id) {
        return { error: 'No active billing cycle found for free registrations.' }
      }
      try {
        const consumed = await consumeEventCredit(
          supabase,
          entitlements.activeCycle.id
        )
        entitlementCycleId = entitlements.activeCycle.id
        creditConsumed = true
        consumedCreditsRemaining = consumed.creditsRemaining
        consumedCreditsGranted = consumed.creditsGranted
      } catch (error) {
        return {
          error:
            error instanceof Error
              ? error.message
              : 'Could not consume a premium event credit.',
        }
      }
      try {
        await appendRegistrationLedger(supabase, {
          userId,
          eventId: input.eventId,
          action: 'credit_consume',
          registrationMethod: 'credit',
          entitlementCycleId,
          creditDelta: -1,
        })
      } catch (error) {
        // Credit already persisted — surface ledger failure without rolling back
        // the durable credit (no-refund product rule still applies on cancel).
        return {
          error:
            error instanceof Error
              ? error.message
              : 'Credit was used but registration ledger failed.',
        }
      }
    } else if (decision.method === 'included_unlimited') {
      paymentStatus = 'not_required'
      await appendRegistrationLedger(supabase, {
        userId,
        eventId: input.eventId,
        action: 'register',
        registrationMethod: 'included_unlimited',
        creditDelta: 0,
      })
    }

    const payload = {
      event_id: input.eventId,
      user_id: userId,
      status: input.status,
      registration_method: registrationMethod,
      payment_status: paymentStatus,
      entitlement_cycle_id: entitlementCycleId,
      credit_consumed: creditConsumed,
      credit_returned: false,
      registered_at: new Date().toISOString(),
      cancelled_at: null,
    }

    const { error } = existingRow
      ? await supabase
          .from('event_attendees')
          .update(payload)
          .eq('event_id', input.eventId)
          .eq('user_id', userId)
      : await supabase.from('event_attendees').insert(payload)

    if (error) {
      if (creditConsumed && entitlementCycleId) {
        try {
          await returnEventCredit(supabase, entitlementCycleId)
        } catch {
          // best-effort rollback of a failed Going write
        }
      }
      return { error: error.message }
    }

    revalidatePath(`/events/${input.eventId}`)
    revalidatePath('/events')
    revalidatePath('/profile')
    revalidatePath('/members')

    // Fresh post-write entitlements (same source of truth as consumeEventCredit).
    const perks = await loadMembershipPerksSnapshot(supabase, viewer)

    if (creditConsumed) {
      const expectedRemaining = consumedCreditsRemaining ?? perks.premiumCreditsRemaining
      const expectedGranted =
        consumedCreditsGranted ?? perks.creditsGranted ?? 2

      // Authoritative response must reflect the durable decrement.
      const durablePerks = {
        ...perks,
        hasPaidMembership: true as const,
        premiumCreditsRemaining: expectedRemaining,
        creditsGranted: expectedGranted,
      }

      if (durablePerks.premiumCreditsRemaining !== expectedRemaining) {
        return {
          error:
            'Credit was consumed but membership perks could not be refreshed.',
        }
      }

      return {
        success: true as const,
        decision,
        usedCredit: true as const,
        perks: durablePerks,
      }
    }

    return {
      success: true as const,
      decision,
      usedCredit: false as const,
      perks,
    }
  }

  const simplePayload = {
    status: input.status,
    cancelled_at: isGoing ? null : new Date().toISOString(),
    // Never mark credits as returned when changing RSVP — no refunds.
    credit_returned: existingRow?.credit_returned ?? false,
    ...(!isGoing &&
    (wasGoing || hasUnpaidGoingPlaceholder) &&
    existingRow?.guest_invite_consumed
      ? { guest_name: null, guest_invite_consumed: false }
      : {}),
  }

  const { error } = existingRow
    ? await supabase
        .from('event_attendees')
        .update(simplePayload)
        .eq('event_id', input.eventId)
        .eq('user_id', userId)
    : await supabase.from('event_attendees').insert({
        event_id: input.eventId,
        user_id: userId,
        ...simplePayload,
      })

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/events/${input.eventId}`)
  revalidatePath('/events')
  revalidatePath('/profile')
  revalidatePath('/members')

  // Reload after possible guest-invite return; credits are never refunded.
  const perks = await loadMembershipPerksSnapshot(supabase, viewer)

  return {
    success: true as const,
    status: input.status,
    refunded: false as const,
    usedCredit: false as const,
    perks,
  }
}

export async function getEventRegistrationPreview(eventId: string) {
  const auth = await requireEntitledViewer()
  if ('error' in auth && auth.error) {
    return { error: auth.error }
  }

  const { supabase, entitlements } = auth

  const { data: event } = await supabase
    .from('events')
    .select(
      'id, starts_at, status, event_type, priority_rsvp_opens_at, general_rsvp_opens_at'
    )
    .eq('id', eventId)
    .single()

  if (!event) {
    return { error: 'Event not found.' }
  }

  const eventType = (event.event_type ?? 'standard_event') as EventAccessType
  const decision = evaluateEventRegistration({
    entitlements,
    eventType,
    eventStatus: event.status,
    isGoingRsvp: true,
    priorityRsvpOpensAt: event.priority_rsvp_opens_at,
    generalRsvpOpensAt: event.general_rsvp_opens_at,
  })

  return {
    entitlements,
    decision,
    eventType,
  }
}
