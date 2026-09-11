'use client'

import { useEffect, useState } from 'react'
import EventMembershipPerksBubble from '@/components/events/event-membership-perks-bubble'
import EventRsvp from '@/app/(club)/events/event-rsvp'
import type { EventRegistrationDecision } from '@/lib/membership-tier-config'
import {
  membershipPerkLinesFromSnapshot,
  type MembershipPerksSnapshot,
} from '@/lib/event-rsvp-window'
import {
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
  rsvpQuestion?: string | null
  rsvpQuestionRequired?: boolean
  initialRsvpAnswer?: string | null
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
  rsvpQuestion = null,
  rsvpQuestionRequired = false,
  initialRsvpAnswer = null,
}: EventPremiumRegistrationSectionProps) {
  const [isGoing, setIsGoing] = useState(currentStatus === 'going')
  const [prevCurrentStatus, setPrevCurrentStatus] = useState(currentStatus)
  const [localGuestName, setLocalGuestName] = useState(guestName)
  const [localGuestConsumed, setLocalGuestConsumed] = useState(
    guestInviteConsumed
  )
  const [prevGuestName, setPrevGuestName] = useState(guestName)
  const [prevGuestConsumed, setPrevGuestConsumed] = useState(guestInviteConsumed)

  if (currentStatus !== prevCurrentStatus) {
    setPrevCurrentStatus(currentStatus)
    setIsGoing(currentStatus === 'going')
  }

  if (
    guestName !== prevGuestName ||
    guestInviteConsumed !== prevGuestConsumed
  ) {
    setPrevGuestName(guestName)
    setPrevGuestConsumed(guestInviteConsumed)
    setLocalGuestName(guestName)
    setLocalGuestConsumed(guestInviteConsumed)
  }

  const {
    productTier,
    hasPaidMembership,
    premiumCreditsRemaining,
    creditsGranted,
    circleSocialCreditsRemaining,
    circleSocialCreditsGranted,
    guestInvitesRemaining,
    periodStart,
    periodEnd,
  } = initialPerks

  // Seed from server; later updates come from RSVP/guest store mutations.
  // Hydrate merges use min(credits) so stale RSC refresh cannot restore spent credits.
  useEffect(() => {
    hydrateMemberPerksFromServer({
      productTier,
      hasPaidMembership,
      premiumCreditsRemaining,
      creditsGranted,
      circleSocialCreditsRemaining,
      circleSocialCreditsGranted,
      guestInvitesRemaining,
      periodStart,
      periodEnd,
    })
  }, [
    productTier,
    hasPaidMembership,
    premiumCreditsRemaining,
    creditsGranted,
    circleSocialCreditsRemaining,
    circleSocialCreditsGranted,
    guestInvitesRemaining,
    periodStart,
    periodEnd,
  ])

  const livePerks = useMemberPerks()
  const perks = livePerks ?? initialPerks
  const perkLines = membershipPerkLinesFromSnapshot(perks)

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
        rsvpQuestion={rsvpQuestion}
        rsvpQuestionRequired={rsvpQuestionRequired}
        initialRsvpAnswer={initialRsvpAnswer}
        onRsvpSuccess={(result) => {
          if (result.status) {
            setIsGoing(result.status === 'going')
          }
          // Store is applied once in EventRsvp — do not re-apply here
          // (a second apply with usedCredit + remaining 1 was force-decrementing to 0).
        }}
      />
      {perkLines.length > 0 ? (
        <EventMembershipPerksBubble
          perkLines={perkLines}
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
