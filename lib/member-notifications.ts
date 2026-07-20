import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

export const MEMBER_NOTIFICATION_TYPES = [
  'curated_matches_delivered',
  'curated_intro_requested',
  'curated_intro_matched',
  'curated_intro_declined',
  'message_request_received',
  'message_request_accepted',
  'message_request_declined',
  'recontact_review_requested',
  'recontact_recipient_prompt',
  'recontact_allowed',
  'recontact_denied_final',
  'new_message',
  'messaging_suspended',
  'messaging_restored',
  'dating_intent_approved',
  'compatibility_questionnaire_ready',
  'membership_upgraded',
  'profile_revision_approved',
] as const

export type MemberNotificationType = (typeof MEMBER_NOTIFICATION_TYPES)[number]

type NotificationTemplate = {
  title: string
  body: string
  href: string
}

export const MEMBER_NOTIFICATION_TEMPLATES: Record<
  MemberNotificationType,
  NotificationTemplate
> = {
  curated_matches_delivered: {
    title: 'New curated matches',
    body: 'New curated matches are ready for you to review.',
    href: '/matches',
  },
  curated_intro_requested: {
    title: 'Message request sent',
    body: 'Your message request was sent. We’ll notify you when they respond.',
    href: '/messages',
  },
  curated_intro_matched: {
    title: 'Conversation opened',
    body: 'Your message request was accepted. Your conversation is ready.',
    href: '/messages',
  },
  curated_intro_declined: {
    title: 'Message request declined',
    body: 'This member declined your message request.',
    href: '/messages',
  },
  message_request_received: {
    title: 'New message request',
    body: 'A member sent you a message request. Review it in your inbox.',
    href: '/messages',
  },
  message_request_accepted: {
    title: 'Message request accepted',
    body: 'Your message request was accepted. You can continue the conversation.',
    href: '/messages',
  },
  message_request_declined: {
    title: 'Message request declined',
    body: 'This member declined your message request.',
    href: '/messages',
  },
  recontact_review_requested: {
    title: 'Recontact review submitted',
    body: 'We received your request for another chance. Our team will follow up.',
    href: '/messages',
  },
  recontact_recipient_prompt: {
    title: 'Allow another message?',
    body: 'A member asked to contact you again. Review the request in your inbox.',
    href: '/messages',
  },
  recontact_allowed: {
    title: 'You may send one more message',
    body: 'The recipient agreed to one more message request. Send it from your inbox.',
    href: '/messages',
  },
  recontact_denied_final: {
    title: 'Recontact not allowed',
    body: 'The recipient is not open to another message request at this time.',
    href: '/messages',
  },
  new_message: {
    title: 'New message',
    body: 'You have a new message in one of your conversations.',
    href: '/messages',
  },
  messaging_suspended: {
    title: 'Messaging on hold',
    body: 'Your messaging access is temporarily on hold.',
    href: '/messages',
  },
  messaging_restored: {
    title: 'Messaging restored',
    body: 'Your messaging access has been restored.',
    href: '/messages',
  },
  dating_intent_approved: {
    title: 'Dating added to profile',
    body: 'Your profile update was approved. You can continue with curated matches.',
    href: '/profile',
  },
  compatibility_questionnaire_ready: {
    title: 'Complete compatibility questionnaire',
    body: 'You can now fill out your private compatibility questionnaire.',
    href: '/compatibility',
  },
  membership_upgraded: {
    title: 'Membership updated',
    body: 'Your membership now includes curated intros, curated matches, and messaging.',
    href: '/profile',
  },
  profile_revision_approved: {
    title: 'Profile update approved',
    body: 'Your latest profile update has been approved.',
    href: '/profile',
  },
}

export type CreateMemberNotificationInput = {
  userId: string
  type: MemberNotificationType
  href?: string
  title?: string
  body?: string | null
  metadata?: Record<string, unknown>
}

export async function createMemberNotification(
  supabase: SupabaseClient<Database>,
  input: CreateMemberNotificationInput
): Promise<void> {
  const template = MEMBER_NOTIFICATION_TEMPLATES[input.type]

  const { error } = await supabase.from('member_notifications').insert({
    user_id: input.userId,
    type: input.type,
    title: input.title ?? template.title,
    body: input.body ?? template.body,
    href: input.href ?? template.href,
    metadata: (input.metadata ?? {}) as never,
  })

  if (error) {
    if (error.code === '42P01') {
      return
    }
    console.error('[notifications] Failed to create notification:', error.message)
  }
}

export function conversationNotificationHref(conversationId: string): string {
  return `/messages/${conversationId}`
}
