import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  conversationNotificationHref,
  createMemberNotification,
} from '@/lib/member-notifications'
import type { RecontactReviewResult } from '@/lib/message-recontact-flow'
import type {
  CreateMessageRequestResult,
  RespondToMessageRequestResult,
} from '@/lib/message-request-flow'

export async function notifyMessageRequestReceived(
  supabase: SupabaseClient<Database>,
  result: CreateMessageRequestResult
) {
  void createMemberNotification(supabase, {
    userId: result.targetMemberId,
    type: 'message_request_received',
    href: conversationNotificationHref(result.conversationId),
    metadata: {
      conversationId: result.conversationId,
      recommendationId: result.recommendationId,
    },
  })
}

export async function notifyMessageRequestAccepted(
  supabase: SupabaseClient<Database>,
  result: RespondToMessageRequestResult
) {
  void createMemberNotification(supabase, {
    userId: result.requesterId,
    type: 'message_request_accepted',
    href: conversationNotificationHref(result.conversationId),
    metadata: {
      conversationId: result.conversationId,
      targetMemberId: result.targetMemberId,
      recommendationId: result.recommendationId,
    },
  })

  if (result.recommendationId) {
    void createMemberNotification(supabase, {
      userId: result.requesterId,
      type: 'curated_intro_matched',
      href: conversationNotificationHref(result.conversationId),
      metadata: {
        conversationId: result.conversationId,
        targetMemberId: result.targetMemberId,
        recommendationId: result.recommendationId,
      },
    })
  }
}

export async function notifyMessageRequestDeclined(
  supabase: SupabaseClient<Database>,
  result: RespondToMessageRequestResult
) {
  void createMemberNotification(supabase, {
    userId: result.requesterId,
    type: 'message_request_declined',
    href: result.recommendationId ? '/matches' : '/messages',
    metadata: {
      conversationId: result.conversationId,
      targetMemberId: result.targetMemberId,
      recommendationId: result.recommendationId,
    },
  })

  if (result.recommendationId) {
    void createMemberNotification(supabase, {
      userId: result.requesterId,
      type: 'curated_intro_declined',
      href: '/matches',
      metadata: {
        conversationId: result.conversationId,
        targetMemberId: result.targetMemberId,
        recommendationId: result.recommendationId,
      },
    })
  }
}

export async function notifyRecontactReviewRequested(
  supabase: SupabaseClient<Database>,
  result: RecontactReviewResult
) {
  void createMemberNotification(supabase, {
    userId: result.requesterId,
    type: 'recontact_review_requested',
    href: conversationNotificationHref(result.conversationId),
    metadata: { conversationId: result.conversationId },
  })
}

export async function notifyRecontactRecipientPrompt(
  supabase: SupabaseClient<Database>,
  result: RecontactReviewResult
) {
  void createMemberNotification(supabase, {
    userId: result.targetMemberId,
    type: 'recontact_recipient_prompt',
    href: conversationNotificationHref(result.conversationId),
    metadata: {
      conversationId: result.conversationId,
      requesterId: result.requesterId,
    },
  })
}

export async function notifyRecontactAllowed(
  supabase: SupabaseClient<Database>,
  result: RecontactReviewResult
) {
  void createMemberNotification(supabase, {
    userId: result.requesterId,
    type: 'recontact_allowed',
    href: conversationNotificationHref(result.conversationId),
    metadata: { conversationId: result.conversationId },
  })
}

export async function notifyRecontactDeniedFinal(
  supabase: SupabaseClient<Database>,
  result: RecontactReviewResult
) {
  void createMemberNotification(supabase, {
    userId: result.requesterId,
    type: 'recontact_denied_final',
    href: result.recommendationId ? '/matches' : '/messages',
    metadata: { conversationId: result.conversationId },
  })
}
