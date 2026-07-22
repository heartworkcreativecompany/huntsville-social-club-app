'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isApprovedMember } from '@/lib/application'
import {
  appendRegistrationLedger,
  consumeGuestInvite,
  loadActiveEntitlementCycle,
  returnGuestInvite,
} from '@/lib/membership-billing-cycles'
import { buildMemberEntitlements } from '@/lib/membership-entitlements'
import { getViewer } from '@/lib/viewer'

/**
 * Schema assumptions:
 * - membership_entitlement_cycles.guest_invites_granted / guest_invites_used
 *   reset each billing period via startEntitlementCycle (Elite gets 1).
 * - event_attendees.guest_name + guest_invite_consumed store the spent invite
 *   on the Elite member's RSVP row (no separate guest user account).
 * - Eligible events: published premium_event only.
 */
export async function addPremiumEventGuestInvite(input: {
  eventId: string
  guestName: string
}) {
  const viewer = await getViewer()
  if (!viewer) {
    return { error: 'You must be signed in.' }
  }
  if (!isApprovedMember(viewer.applicationStatus, viewer.role)) {
    return { error: 'Membership approval is required.' }
  }

  const guestName = input.guestName.trim()
  if (guestName.length < 2) {
    return { error: 'Enter your guest’s name (at least 2 characters).' }
  }
  if (guestName.length > 80) {
    return { error: 'Guest name is too long.' }
  }

  const supabase = await createClient()
  const activeCycle = await loadActiveEntitlementCycle(supabase, viewer.userId)
  const entitlements = buildMemberEntitlements({
    role: viewer.role,
    billing: viewer.profile?.membership_billing,
    applicationApproved: true,
    activeCycle,
  })

  if (entitlements.productTier !== 'elite_circle') {
    return { error: 'Guest invites are available to Elite Circle members only.' }
  }
  if (entitlements.guestInvitesRemaining <= 0 || !entitlements.activeCycle?.id) {
    return { error: 'No guest invites remaining this billing period.' }
  }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, status, event_type')
    .eq('id', input.eventId)
    .maybeSingle()

  if (eventError || !event) {
    return { error: eventError?.message ?? 'Event not found.' }
  }
  if (event.status !== 'published') {
    return { error: 'Guests can only be added on published events.' }
  }
  if (event.event_type !== 'premium_event') {
    return { error: 'Guest invites can only be used on premium events.' }
  }

  const { data: attendee, error: attendeeError } = await supabase
    .from('event_attendees')
    .select('status, guest_name, guest_invite_consumed')
    .eq('event_id', input.eventId)
    .eq('user_id', viewer.userId)
    .maybeSingle()

  if (attendeeError) {
    return { error: attendeeError.message }
  }
  if (!attendee || attendee.status !== 'going') {
    return { error: 'RSVP as Going before adding a guest.' }
  }
  if (attendee.guest_invite_consumed || attendee.guest_name) {
    return { error: 'You already used a guest invite on this event.' }
  }

  const cycleId = entitlements.activeCycle.id

  try {
    await consumeGuestInvite(supabase, cycleId)
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Could not use guest invite.',
    }
  }

  const { error: updateError } = await supabase
    .from('event_attendees')
    .update({
      guest_name: guestName,
      guest_invite_consumed: true,
    })
    .eq('event_id', input.eventId)
    .eq('user_id', viewer.userId)

  if (updateError) {
    await returnGuestInvite(supabase, cycleId)
    return { error: updateError.message }
  }

  await appendRegistrationLedger(supabase, {
    userId: viewer.userId,
    eventId: input.eventId,
    action: 'guest_invite_consume',
    registrationMethod: null,
    entitlementCycleId: cycleId,
    creditDelta: 0,
    metadata: { guest_name: guestName },
  })

  revalidatePath(`/events/${input.eventId}`)
  revalidatePath('/events')
  revalidatePath('/profile')
  return { success: true as const, guestName }
}

export async function removePremiumEventGuestInvite(input: { eventId: string }) {
  const viewer = await getViewer()
  if (!viewer) {
    return { error: 'You must be signed in.' }
  }

  const supabase = await createClient()
  const activeCycle = await loadActiveEntitlementCycle(supabase, viewer.userId)

  const { data: attendee, error: attendeeError } = await supabase
    .from('event_attendees')
    .select('status, guest_name, guest_invite_consumed')
    .eq('event_id', input.eventId)
    .eq('user_id', viewer.userId)
    .maybeSingle()

  if (attendeeError) {
    return { error: attendeeError.message }
  }
  if (!attendee?.guest_invite_consumed) {
    return { error: 'No guest invite on this RSVP.' }
  }

  const { error: updateError } = await supabase
    .from('event_attendees')
    .update({
      guest_name: null,
      guest_invite_consumed: false,
    })
    .eq('event_id', input.eventId)
    .eq('user_id', viewer.userId)

  if (updateError) {
    return { error: updateError.message }
  }

  if (activeCycle?.id) {
    await returnGuestInvite(supabase, activeCycle.id)
    await appendRegistrationLedger(supabase, {
      userId: viewer.userId,
      eventId: input.eventId,
      action: 'guest_invite_return',
      entitlementCycleId: activeCycle.id,
      creditDelta: 0,
      metadata: { guest_name: attendee.guest_name },
    })
  }

  revalidatePath(`/events/${input.eventId}`)
  revalidatePath('/events')
  revalidatePath('/profile')
  return { success: true as const }
}
