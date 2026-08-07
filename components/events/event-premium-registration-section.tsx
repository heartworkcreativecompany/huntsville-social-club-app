'use client'

import { useEffect, useState } from 'react'
import EventMembershipPerksBubble from '@/components/events/event-membership-perks-bubble'
import EventRsvp from '@/app/(club)/events/event-rsvp'
import type { EventRegistrationDecision } from '@/lib/membership-tier-config'
import {
  membershipPerksSummaryFromSnapshot,
  type MembershipPerksSnapshot,
} from '@/lib/event-rsvp-window'
import {
  applyRsvpResultToMemberPerksStore,
  hydrateMemberPerksFromServer,
  updateMemberPerksFromSnapshot,
  useMemberPerks,
} from '@/lib/member-perks-store'

type EventPremiumRegistrationSectionProps = {
  eventId: string
  eventStatus: string
  currentStatus: string | null
  registrationPreview: EventRegistrationDecision | null
  canRegisterGoing: boolean
  atCapacityMessage: string | null
  feeCents: number | null
  eventType: string | null
  guestName: string | null
  guestInviteConsumed: boolean
  isElite: boolean
  initialPerks: MembershipPerksSnapshot
}

export default function EventPremiumRegistrationSection({
  eventId,
  eventStatus,
  currentStatus,
  registrationPreview,
  canRegisterGoing,
  atCapacityMessage,
  feeCents,
  eventType,
  guestName,
  guestInviteConsumed,
  isElite,
  initialPerks,
}: EventPremiumRegistrationSectionProps) {
  const [isGoing, setIsGoing] = useState(currentStatus === 'going')
  const [localGuestName, setLocalGuestName] = useState(guestName)
  const [localGuestConsumed, setLocalGuestConsumed] = useState(
    guestInviteConsumed
  )

  // Seed once from server; later updates come from RSVP/guest store mutations.
  // Hydrate merges use min(credits) so stale RSC refresh cannot restore spent credits.
  useEffect(() => {
    hydrateMemberPerksFromServer(initialPerks)
  }, [
    initialPerks.productTier,
    initialPerks.hasPaidMembership,
    initialPerks.premiumCreditsRemaining,
    initialPerks.creditsGranted,
    initialPerks.guestInvitesRemaining,
    initialPerks.periodStart,
    initialPerks.periodEnd,
  ])

  useEffect(() => {
    setIsGoing(currentStatus === 'going')
  }, [currentStatus])

  useEffect(() => {
    setLocalGuestName(guestName)
    setLocalGuestConsumed(guestInviteConsumed)
  }, [guestName, guestInviteConsumed])

  const livePerks = useMemberPerks()
  const perks = livePerks ?? initialPerks
  const creditSummary = membershipPerksSummaryFromSnapshot(perks)

  return (
    <>
      <EventRsvp
        eventId={eventId}
        eventStatus={eventStatus}
        currentStatus={currentStatus}
        registrationPreview={registrationPreview}
        canRegisterGoing={canRegisterGoing}
        atCapacityMessage={atCapacityMessage}
        feeCents={feeCents}
        premiumLayout
        onRsvpSuccess={(result) => {
          if (result.status) {
            setIsGoing(result.status === 'going')
          }
          // EventRsvp already applied the store; re-apply is idempotent and
          // covers older call sites that only used this callback.
          applyRsvpResultToMemberPerksStore({
            usedCredit: result.usedCredit,
            perks: result.perks,
          })
        }}
      />
      {creditSummary ? (
        <EventMembershipPerksBubble
          creditSummary={creditSummary}
          eventId={eventId}
          eventType={eventType}
          isGoing={isGoing}
          guestName={localGuestName}
          guestInviteConsumed={localGuestConsumed}
          guestInvitesRemaining={perks.guestInvitesRemaining}
          isElite={isElite}
          onGuestInviteChange={({
            guestName: nextName,
            consumed,
            perks: nextPerks,
          }) => {
            setLocalGuestName(nextName)
            setLocalGuestConsumed(consumed)
            if (nextPerks) {
              updateMemberPerksFromSnapshot(nextPerks)
            }
          }}
        />
      ) : null}
    </>
  )
}
