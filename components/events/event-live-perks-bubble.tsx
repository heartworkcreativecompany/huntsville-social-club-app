'use client'

import { useEffect } from 'react'
import EventMembershipPerksBubble from '@/components/events/event-membership-perks-bubble'
import {
  membershipPerkLinesFromSnapshot,
  type MembershipPerksSnapshot,
} from '@/lib/event-rsvp-window'
import {
  hydrateMemberPerksFromServer,
  useMemberPerks,
} from '@/lib/member-perks-store'

export default function EventLivePerksBubble({
  eventId,
  eventType,
  isGoing,
  guestName,
  guestInviteConsumed,
  isElite,
  initialPerks,
}: {
  eventId: string
  eventType: string | null
  isGoing: boolean
  guestName: string | null
  guestInviteConsumed: boolean
  isElite: boolean
  initialPerks: MembershipPerksSnapshot
}) {
  useEffect(() => {
    hydrateMemberPerksFromServer(initialPerks)
  }, [
    initialPerks.productTier,
    initialPerks.hasPaidMembership,
    initialPerks.premiumCreditsRemaining,
    initialPerks.circleSocialCreditsRemaining,
    initialPerks.creditsGranted,
    initialPerks.circleSocialCreditsGranted,
    initialPerks.guestInvitesRemaining,
    initialPerks.periodStart,
    initialPerks.periodEnd,
  ])

  const livePerks = useMemberPerks()
  const perks = livePerks ?? initialPerks
  const perkLines = membershipPerkLinesFromSnapshot(perks)
  if (perkLines.length === 0) return null

  return (
    <EventMembershipPerksBubble
      perkLines={perkLines}
      eventId={eventId}
      eventType={eventType}
      isGoing={isGoing}
      guestName={guestName}
      guestInviteConsumed={guestInviteConsumed}
      guestInvitesRemaining={perks.guestInvitesRemaining}
      isElite={isElite}
    />
  )
}
