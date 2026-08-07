import type { EventRegistrationDecision } from '@/lib/membership-tier-config'

/**
 * Going is blocked only when the member cannot register Going and is not
 * already Going. Eligible members (RSVP open + allowed) always get an
 * enabled primary Going button.
 */
export function resolveGoingButtonState(input: {
  canRegisterGoing: boolean
  currentStatus?: string | null
  isPending?: boolean
}): { goingBlocked: boolean; disabled: boolean } {
  const alreadyGoing = input.currentStatus === 'going'
  const goingBlocked = !input.canRegisterGoing && !alreadyGoing
  const disabled = Boolean(input.isPending) || goingBlocked
  return { goingBlocked, disabled }
}

export function isGoingRegistrationEligible(
  registrationPreview: EventRegistrationDecision | null | undefined,
  atCapacity: boolean
): boolean {
  if (atCapacity) return false
  if (!registrationPreview) return true
  return registrationPreview.allowed !== false
}
