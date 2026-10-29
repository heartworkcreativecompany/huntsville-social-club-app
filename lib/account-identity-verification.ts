import {
  IDENTITY_LOOKUP_UNAVAILABLE_MESSAGE,
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

export const ACCOUNT_IDENTITY_VERIFIED_DETAIL =
  'Your identity is verified. Both members must have verified identities before a message request can be sent. A conversation starts once the request is accepted.' as const

export const ACCOUNT_IDENTITY_NOT_STARTED_DETAIL =
  'Verify your identity to request messages with other verified members. You don’t need to complete this step to have your membership approved.' as const

export const ACCOUNT_IDENTITY_RETRY_DETAIL =
  'Identity verification is not required for membership approval. Both members must have verified identities before a message request can be sent. Retry verification to continue.' as const

export const ACCOUNT_IDENTITY_CANCELED_DETAIL =
  'Identity verification is not required for membership approval. Both members must have verified identities before a message request can be sent. You can start verification again.' as const

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
      detail: ACCOUNT_IDENTITY_VERIFIED_DETAIL,
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
      detail: ACCOUNT_IDENTITY_RETRY_DETAIL,
      action: 'retry',
      actionLabel: 'Retry verification',
      createsSession: true,
    }
  }

  if (stripeStatus === 'canceled') {
    return {
      statusLabel: 'Canceled',
      detail: ACCOUNT_IDENTITY_CANCELED_DETAIL,
      action: 'start',
      actionLabel: ACCOUNT_IDENTITY_VERIFICATION_LINK_LABEL,
      createsSession: true,
    }
  }

  return {
    statusLabel: 'Not started',
    detail: ACCOUNT_IDENTITY_NOT_STARTED_DETAIL,
    action: 'start',
    actionLabel: ACCOUNT_IDENTITY_VERIFICATION_LINK_LABEL,
    createsSession: true,
  }
}
