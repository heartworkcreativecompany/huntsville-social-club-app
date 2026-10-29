import {
  IDENTITY_LOOKUP_UNAVAILABLE_MESSAGE,
  IDENTITY_REQUIRED_BEFORE_MESSAGING,
  type AcceptedIdentityStatus,
} from '@/lib/identity-verification'

export const ACCOUNT_IDENTITY_VERIFICATION_HREF =
  '/profile#identity-verification' as const

export const ACCOUNT_IDENTITY_VERIFICATION_LINK_LABEL = 'Verify my identity' as const

export type AccountIdentityVerificationAction = 'start' | 'retry'

export type AccountIdentityVerificationCard = {
  statusLabel: string
  detail: string
  action: AccountIdentityVerificationAction | null
  actionLabel: string | null
  /** True only when the existing Stripe session route may be called. */
  createsSession: boolean
}

const MESSAGING_REQUIREMENT =
  'Identity verification is not required for membership approval. Accepted identity is required before you can send messages.'

/**
 * Account-page identity card.
 * Accepted identity is the resolver result already computed from Stripe
 * verification or an active in-person record. Approval, payment, email,
 * photos, and locality are not inputs.
 */
export function accountIdentityVerificationCard(input: {
  accepted: AcceptedIdentityStatus
  stripeStatus?: string | null
}): AccountIdentityVerificationCard {
  if (input.accepted === 'verified') {
    return {
      statusLabel: 'Identity verified',
      detail:
        'Your identity is verified for messaging. The recipient must also have accepted identity, and your other messaging rules still apply.',
      action: null,
      actionLabel: null,
      createsSession: false,
    }
  }

  if (input.accepted === 'unavailable') {
    return {
      statusLabel: 'Unavailable',
      detail: IDENTITY_LOOKUP_UNAVAILABLE_MESSAGE,
      action: null,
      actionLabel: null,
      createsSession: false,
    }
  }

  const stripeStatus = input.stripeStatus ?? 'not_started'

  if (stripeStatus === 'pending' || stripeStatus === 'processing') {
    return {
      statusLabel: stripeStatus === 'processing' ? 'Processing' : 'Pending',
      detail:
        'Identity verification is already in progress. This page will not start another session. Refresh to see the latest result.',
      action: null,
      actionLabel: null,
      createsSession: false,
    }
  }

  if (stripeStatus === 'requires_input') {
    return {
      statusLabel: 'Needs retry',
      detail: `${MESSAGING_REQUIREMENT} ${IDENTITY_REQUIRED_BEFORE_MESSAGING}`,
      action: 'retry',
      actionLabel: 'Retry verification',
      createsSession: true,
    }
  }

  if (stripeStatus === 'canceled') {
    return {
      statusLabel: 'Canceled',
      detail: `${MESSAGING_REQUIREMENT} You can start verification again.`,
      action: 'start',
      actionLabel: ACCOUNT_IDENTITY_VERIFICATION_LINK_LABEL,
      createsSession: true,
    }
  }

  return {
    statusLabel: 'Not started',
    detail: `${MESSAGING_REQUIREMENT} ${IDENTITY_REQUIRED_BEFORE_MESSAGING}`,
    action: 'start',
    actionLabel: ACCOUNT_IDENTITY_VERIFICATION_LINK_LABEL,
    createsSession: true,
  }
}
