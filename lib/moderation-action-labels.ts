import type { ModerationActionType } from '@/lib/moderation-actions'

export const MODERATION_ACTION_TYPES: ModerationActionType[] = [
  'message_report_reviewed',
  'message_report_dismissed',
  'messaging_suspended',
  'messaging_unsuspended',
  'admin_member_block',
  'recognition_badge_awarded',
  'recognition_badge_revoked',
]

export function moderationActionLabel(actionType: string): string {
  switch (actionType) {
    case 'message_report_reviewed':
      return 'Report reviewed'
    case 'message_report_dismissed':
      return 'Report dismissed'
    case 'messaging_suspended':
      return 'Messaging suspended'
    case 'messaging_unsuspended':
      return 'Messaging restored'
    case 'admin_member_block':
      return 'Admin block'
    case 'recognition_badge_awarded':
      return 'Recognition badge awarded'
    case 'recognition_badge_revoked':
      return 'Recognition badge revoked'
    default:
      return actionType
  }
}

export const MODERATION_SOURCE_TYPES = [
  'member_conversation_report',
  'recognition_badge',
] as const

export type ModerationSourceType = (typeof MODERATION_SOURCE_TYPES)[number]

export function moderationSourceLabel(sourceType: string | null): string {
  switch (sourceType) {
    case 'member_conversation_report':
      return 'Message report'
    case 'recognition_badge':
      return 'Recognition badge'
    case null:
      return '—'
    default:
      return sourceType
  }
}

export function moderationSourceHref(
  sourceType: string | null,
  sourceId: string | null
): string | null {
  if (!sourceId) return null
  switch (sourceType) {
    case 'member_conversation_report':
      return `/admin/message-reports?report=${sourceId}`
    default:
      return null
  }
}
