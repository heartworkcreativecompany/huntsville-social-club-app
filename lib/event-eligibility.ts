import type { ApplicationStatus } from '@/lib/application'
import { isApprovedMember } from '@/lib/application'
import { eventStatusLabel } from '@/lib/event-labels'

export type EventTier = 'standard' | 'members' | 'hosts' | 'invite'

export type EligibilityVariant = 'success' | 'warning' | 'muted' | 'danger'

export type EventEligibility = {
  tier: EventTier
  tierLabel: string
  tierDescription: string
  accessLabel: string
  accessDescription: string
  variant: EligibilityVariant
  canRsvpNow: boolean
  rsvpMessage: string
  showWaitlistScaffold: boolean
  showCheckInScaffold: boolean
}

type EventLike = {
  status: string | null
  visibility: string
}

type ViewerLike = {
  applicationStatus: ApplicationStatus
  role: string
}

export function resolveEventTier(visibility: string): EventTier {
  const value = visibility.toLowerCase()
  if (value === 'hosts' || value === 'host') return 'hosts'
  if (value === 'invite' || value === 'private' || value === 'invite_only') {
    return 'invite'
  }
  return 'members'
}

export function tierLabel(tier: EventTier): string {
  if (tier === 'hosts') return 'Host tier'
  if (tier === 'invite') return 'Invite-only'
  return 'Member tier'
}

export function tierDescription(tier: EventTier): string {
  if (tier === 'hosts') return 'Programming reserved for verified hosts and administrators.'
  if (tier === 'invite') return 'Invitation and tier rules will apply when gating is enabled.'
  return 'Open to approved club members in good standing.'
}

export function resolveEventEligibility(
  event: EventLike,
  viewer: ViewerLike
): EventEligibility {
  const tier = resolveEventTier(event.visibility)
  const status = event.status ?? 'published'
  const isApproved = isApprovedMember(viewer.applicationStatus, viewer.role)

  const base = {
    tier,
    tierLabel: tierLabel(tier),
    tierDescription: tierDescription(tier),
    showWaitlistScaffold: tier === 'invite' || status === 'published',
    showCheckInScaffold: false,
  }

  if (status === 'cancelled') {
    return {
      ...base,
      accessLabel: 'Cancelled',
      accessDescription: 'This gathering is no longer active. RSVPs are closed.',
      variant: 'muted',
      canRsvpNow: false,
      rsvpMessage: 'This event has been cancelled.',
    }
  }

  if (status === 'draft' || status === 'pending_approval') {
    return {
      ...base,
      accessLabel: status === 'pending_approval' ? 'Pending approval' : 'Draft',
      accessDescription:
        status === 'pending_approval'
          ? 'Awaiting admin approval before members can RSVP.'
          : 'Visible to hosts and administrators until published.',
      variant: 'warning',
      canRsvpNow: false,
      rsvpMessage:
        status === 'pending_approval'
          ? 'RSVP opens after an admin publishes this event.'
          : 'RSVP opens when the host publishes this event.',
    }
  }

  if (!isApproved) {
    return {
      ...base,
      accessLabel: 'Membership review',
      accessDescription:
        'Complete verification to RSVP and appear on attendee lists.',
      variant: 'warning',
      canRsvpNow: true,
      rsvpMessage:
        'You may save a response while your membership is reviewed; hosts see counts on the list page.',
    }
  }

  if (tier === 'hosts' && viewer.role !== 'host' && viewer.role !== 'admin') {
    return {
      ...base,
      accessLabel: 'Host eligibility',
      accessDescription:
        'This session is oriented toward hosts. Member RSVP remains available until tier enforcement ships.',
      variant: 'warning',
      canRsvpNow: true,
      rsvpMessage: 'Tier gating is not yet enforced in the database.',
    }
  }

  if (tier === 'invite') {
    return {
      ...base,
      accessLabel: 'Invite-only (preview)',
      accessDescription:
        'Waitlist and invitation flows are planned; RSVP still uses the standard member flow today.',
      variant: 'muted',
      canRsvpNow: true,
      rsvpMessage: 'Join the waitlist UI will appear here once tier gating is live.',
      showWaitlistScaffold: true,
    }
  }

  return {
    ...base,
    accessLabel: 'Eligible',
    accessDescription: `Published · ${eventStatusLabel(status)} · ${tierLabel(tier)} access`,
    variant: 'success',
    canRsvpNow: true,
    rsvpMessage: 'RSVP counts appear on the calendar; names are on the event detail page only.',
  }
}
