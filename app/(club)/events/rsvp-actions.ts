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
  shouldReturnFreeRegistrationOnCancellation,
} from '@/lib/membership-entitlements'
import type { EventAccessType } from '@/lib/membership-tier-config'
import { getViewer } from '@/lib/viewer'

export type RsvpStatus = 'going' | 'maybe' | 'not_going'

type EventRow = {
  id: string
  starts_at: string
  status: string | null
  event_type: string | null
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
      'id, starts_at, status, event_type, priority_rsvp_opens_at, general_rsvp_opens_at'
    )
    .eq('id', input.eventId)
    .single()

  if (eventError || !event) {
    return { error: eventError?.message ?? 'Event not found.' }
  }

  const eventRow = event as EventRow & {
    priority_rsvp_opens_at?: string | null
    general_rsvp_opens_at?: string | null
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
  const wasGoing = existingRow?.status === 'going'

  if (!isGoing && wasGoing && existingRow?.credit_consumed && existingRow.entitlement_cycle_id) {
    const returnFreeRegistration = shouldReturnFreeRegistrationOnCancellation(
      eventRow.starts_at,
      true
    )

    if (returnFreeRegistration && !existingRow.credit_returned) {
      await returnEventCredit(supabase, existingRow.entitlement_cycle_id)
      await appendRegistrationLedger(supabase, {
        userId,
        eventId: input.eventId,
        action: 'credit_return',
        registrationMethod: existingRow.registration_method,
        entitlementCycleId: existingRow.entitlement_cycle_id,
        creditDelta: 1,
        metadata: { reason: 'cancelled_before_cutoff' },
      })
    } else if (!returnFreeRegistration) {
      await appendRegistrationLedger(supabase, {
        userId,
        eventId: input.eventId,
        action: 'cancel',
        registrationMethod: existingRow.registration_method,
        entitlementCycleId: existingRow.entitlement_cycle_id,
        creditDelta: 0,
        metadata: { reason: 'within_cutoff_no_return' },
      })
    }
  }

  // Cancelling Going also returns a spent guest invite to the active cycle.
  if (!isGoing && wasGoing && existingRow?.guest_invite_consumed) {
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

    let registrationMethod = decision.method
    let paymentStatus: string | null = null
    let entitlementCycleId: string | null = null
    let creditConsumed = false

    if (decision.method === 'paid_per_event') {
      paymentStatus = 'pending'
      await appendRegistrationLedger(supabase, {
        userId,
        eventId: input.eventId,
        action: 'payment_required',
        registrationMethod: 'paid_per_event',
        creditDelta: 0,
        metadata: { payment_status: 'pending' },
      })
    } else if (decision.method === 'credit') {
      if (!entitlements.activeCycle?.id) {
        return { error: 'No active billing cycle found for free registrations.' }
      }
      await consumeEventCredit(supabase, entitlements.activeCycle.id)
      entitlementCycleId = entitlements.activeCycle.id
      creditConsumed = true
      await appendRegistrationLedger(supabase, {
        userId,
        eventId: input.eventId,
        action: 'credit_consume',
        registrationMethod: 'credit',
        entitlementCycleId,
        creditDelta: -1,
      })
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
        await returnEventCredit(supabase, entitlementCycleId)
      }
      return { error: error.message }
    }

    return { success: true as const, decision }
  }

  const simplePayload = {
    status: input.status,
    cancelled_at: isGoing ? null : new Date().toISOString(),
    credit_returned: Boolean(
      !isGoing && wasGoing && existingRow?.credit_consumed
        ? shouldReturnFreeRegistrationOnCancellation(eventRow.starts_at, true) ||
            existingRow?.credit_returned
        : existingRow?.credit_returned
    ),
    ...(!isGoing && wasGoing && existingRow?.guest_invite_consumed
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

  return { success: true as const }
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
