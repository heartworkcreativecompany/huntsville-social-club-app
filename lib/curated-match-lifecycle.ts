import type { CuratedMatchIntroStatus } from '@/lib/load-curated-matches'

/** @deprecated Use CuratedMatchDisplayState for member-facing UI. */
export type CuratedMatchLifecycle =
  | 'available'
  | 'intro_requested'
  | 'matched'
  | 'declined'
  | 'unavailable'

export type CuratedMatchDisplayState =
  | 'new'
  | 'viewed'
  | 'intro_requested'
  | 'connected'
  | 'passed'
  | 'declined'
  | 'expired'

export function curatedMatchDisplayState(input: {
  introStatus: CuratedMatchIntroStatus
  recommendationStatus: string
}): CuratedMatchDisplayState {
  if (input.introStatus === 'matched' || input.recommendationStatus === 'accepted') {
    return 'connected'
  }

  if (input.introStatus === 'pending') {
    return 'intro_requested'
  }

  if (input.recommendationStatus === 'expired') {
    return 'expired'
  }

  if (
    input.recommendationStatus === 'declined' ||
    input.introStatus === 'declined'
  ) {
    return 'declined'
  }

  if (input.recommendationStatus === 'passed') {
    return 'passed'
  }

  if (input.recommendationStatus === 'viewed') {
    return 'viewed'
  }

  return 'new'
}

export function curatedMatchDisplayLabel(state: CuratedMatchDisplayState): string {
  switch (state) {
    case 'new':
      return 'New'
    case 'viewed':
      return 'Viewed'
    case 'intro_requested':
      return 'Request sent'
    case 'connected':
      return 'Connected'
    case 'passed':
      return 'Passed'
    case 'declined':
      return 'Not available'
    case 'expired':
      return 'Expired'
  }
}

export function curatedMatchDisplayBadgeVariant(
  state: CuratedMatchDisplayState
): 'accent' | 'success' | 'muted' | 'warning' {
  switch (state) {
    case 'new':
      return 'accent'
    case 'viewed':
      return 'accent'
    case 'intro_requested':
      return 'warning'
    case 'connected':
      return 'success'
    case 'passed':
    case 'declined':
    case 'expired':
      return 'muted'
  }
}

export function curatedMatchDisplayDetail(state: CuratedMatchDisplayState): string {
  switch (state) {
    case 'new':
      return 'A new curated recommendation. Send a message request when you would like to connect.'
    case 'viewed':
      return 'You have seen this recommendation. Send a message request or pass if it is not a fit.'
    case 'intro_requested':
      return 'Your message request is waiting for them to accept or decline.'
    case 'connected':
      return 'Your message request was accepted. Open messages to continue the conversation.'
    case 'passed':
      return 'You passed on this recommendation. It will not appear in your active inbox.'
    case 'declined':
      return 'This member declined your message request. You may request a recontact review from the conversation thread.'
    case 'expired':
      return 'This recommendation expired before an intro was requested.'
  }
}

export function isArchivedMatchDisplayState(
  state: CuratedMatchDisplayState
): boolean {
  return state === 'passed' || state === 'declined' || state === 'expired'
}

/** @deprecated Use curatedMatchDisplayState for member-facing UI. */
export function curatedMatchLifecycle(input: {
  introStatus: CuratedMatchIntroStatus
  recommendationStatus: string
}): CuratedMatchLifecycle {
  const state = curatedMatchDisplayState(input)
  switch (state) {
    case 'new':
    case 'viewed':
      return 'available'
    case 'intro_requested':
      return 'intro_requested'
    case 'connected':
      return 'matched'
    case 'passed':
    case 'declined':
      return 'declined'
    case 'expired':
      return 'unavailable'
  }
}

/** @deprecated Use curatedMatchDisplayLabel. */
export function curatedMatchLifecycleLabel(lifecycle: CuratedMatchLifecycle): string {
  switch (lifecycle) {
    case 'available':
      return 'Available'
    case 'intro_requested':
      return 'Intro requested'
    case 'matched':
      return 'Connected'
    case 'declined':
      return 'Unavailable'
    case 'unavailable':
      return 'Expired'
  }
}

/** @deprecated Use curatedMatchDisplayBadgeVariant. */
export function curatedMatchLifecycleBadgeVariant(
  lifecycle: CuratedMatchLifecycle
): 'accent' | 'success' | 'muted' | 'warning' {
  switch (lifecycle) {
    case 'available':
      return 'accent'
    case 'intro_requested':
      return 'warning'
    case 'matched':
      return 'success'
    case 'declined':
    case 'unavailable':
      return 'muted'
  }
}
