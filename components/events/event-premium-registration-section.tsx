'use client'

import { useEffect, useState } from 'react'
import EventMembershipPerksBubble from '@/components/events/event-membership-perks-bubble'
import EventRsvp from '@/app/(club)/events/event-rsvp'
import type { EventRegistrationDecision } from '@/lib/membership-tier-config'
import {
  applyRsvpPerksSnapshot,
  membershipPerksSummaryFromSnapshot,
  type MembershipPerksSnapshot,
} from '@/lib/event-rsvp-window'

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
  const [perks, setPerks] = useState(initialPerks)
  const [isGoing, setIsGoing] = useState(currentStatus === 'going')

  useEffect(() => {
    // Merge server props after refresh, but never let a stale RSC payload
    // bump premium credits back up (e.g. still showing 2 after a credit was used).
    setPerks((previous) => {
      if (
        initialPerks.premiumCreditsRemaining > previous.premiumCreditsRemaining
      ) {
        return {
          ...initialPerks,
          premiumCreditsRemaining: previous.premiumCreditsRemaining,
        }
      }
      return initialPerks
    })
  }, [
    initialPerks.productTier,
    initialPerks.premiumCreditsRemaining,
    initialPerks.creditsGranted,
    initialPerks.guestInvitesRemaining,
  ])

  useEffect(() => {
    setIsGoing(currentStatus === 'going')
  }, [currentStatus])

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
          setPerks((previous) =>
            applyRsvpPerksSnapshot({
              previous,
              usedCredit: result.usedCredit,
              perks: result.perks,
            })
          )
        }}
      />
      {creditSummary ? (
        <EventMembershipPerksBubble
          creditSummary={creditSummary}
          eventId={eventId}
          eventType={eventType}
          isGoing={isGoing}
          guestName={guestName}
          guestInviteConsumed={guestInviteConsumed}
          guestInvitesRemaining={perks.guestInvitesRemaining}
          isElite={isElite}
        />
      ) : null}
    </>
  )
}
