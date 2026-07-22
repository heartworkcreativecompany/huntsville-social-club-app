import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { loadProfileAccountEmails } from '@/lib/load-profile-account-emails'
import { memberDisplayName } from '@/lib/members-discovery'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'
import {
  conversationNotificationHref,
  createMemberNotification,
} from '@/lib/member-notifications'
import type { RecontactReviewResult } from '@/lib/message-recontact-flow'
import type {
  CreateMessageRequestResult,
  RespondToMessageRequestResult,
} from '@/lib/message-request-flow'
import {
  sendCuratedIntroMatchedEmail,
  sendCuratedIntroMatchedTargetEmail,
} from '@/lib/transactional-email'

type ProfileRow = {
  id: string
  full_name: string | null
}

async function loadProfiles(
  supabase: SupabaseClient<Database>,
  ids: string[]
): Promise<Map<string, ProfileRow>> {
  const map = new Map<string, ProfileRow>()
  if (ids.length === 0) {
    return map
  }

  const { data } = await supabase
    .from(MEMBER_PROFILES_VIEW)
    .select('id, full_name')
    .in('id', ids)

  for (const profile of data ?? []) {
    map.set(profile.id, profile)
  }

  return map
}

function displayName(profile: ProfileRow | undefined): string {
  if (!profile) {
    return 'Member'
  }

  return memberDisplayName(profile)
}

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
  const profiles = await loadProfiles(supabase, [
    result.requesterId,
    result.targetMemberId,
  ])
  const accountEmails = await loadProfileAccountEmails([
    result.requesterId,
    result.targetMemberId,
  ])
  const requester = profiles.get(result.requesterId)
  const target = profiles.get(result.targetMemberId)

  void createMemberNotification(supabase, {
    userId: result.requesterId,
    type: 'message_request_accepted',
    href: conversationNotificationHref(result.conversationId),
    metadata: {
      conversationId: result.conversationId,
      targetMemberId: result.targetMemberId,
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

  const requesterEmail = accountEmails.get(result.requesterId)
  const targetEmail = accountEmails.get(result.targetMemberId)

  if (requesterEmail) {
    void sendCuratedIntroMatchedEmail({
      to: requesterEmail,
      otherMemberName: displayName(target),
      conversationId: result.conversationId,
    })
  }

  if (targetEmail) {
    void sendCuratedIntroMatchedTargetEmail({
      to: targetEmail,
      otherMemberName: displayName(requester),
      conversationId: result.conversationId,
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
