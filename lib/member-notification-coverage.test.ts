import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MEMBER_NOTIFICATION_TEMPLATES,
  MEMBER_NOTIFICATION_TYPES,
  type MemberNotificationType,
} from '@/lib/member-notifications'

const TRIGGER_FILES: Record<MemberNotificationType, string> = {
  curated_matches_delivered: 'lib/curated-match-notifications.ts',
  curated_intro_requested: 'app/(club)/messages/actions.ts',
  curated_intro_matched: 'lib/message-request-notifications.ts',
  curated_intro_declined: 'lib/message-request-notifications.ts',
  message_request_received: 'lib/message-request-notifications.ts',
  message_request_accepted: 'lib/message-request-notifications.ts',
  message_request_declined: 'lib/message-request-notifications.ts',
  recontact_review_requested: 'lib/message-request-notifications.ts',
  recontact_recipient_prompt: 'lib/message-request-notifications.ts',
  recontact_allowed: 'lib/message-request-notifications.ts',
  recontact_denied_final: 'lib/message-request-notifications.ts',
  new_message: 'app/(club)/messages/actions.ts',
  messaging_suspended: 'lib/message-report-moderation.ts',
  messaging_restored: 'lib/message-report-moderation.ts',
  dating_intent_approved: 'lib/compatibility/dating-lifecycle.ts',
  compatibility_questionnaire_ready: 'lib/compatibility/subscription-lifecycle.ts',
  membership_upgraded: 'lib/compatibility/subscription-sync-hook.ts',
  profile_revision_approved: 'app/(club)/admin/profile-revisions/actions.ts',
}

describe('member notification templates', () => {
  it('defines copy for every notification type', () => {
    for (const type of MEMBER_NOTIFICATION_TYPES) {
      expect(MEMBER_NOTIFICATION_TEMPLATES[type].title.length).toBeGreaterThan(0)
      expect(MEMBER_NOTIFICATION_TEMPLATES[type].body.length).toBeGreaterThan(0)
      expect(MEMBER_NOTIFICATION_TEMPLATES[type].href.startsWith('/')).toBe(true)
    }
  })
})

describe('member notification trigger coverage', () => {
  it('wires each notification type to a server-side create call', () => {
    for (const type of MEMBER_NOTIFICATION_TYPES) {
      const filePath = join(process.cwd(), TRIGGER_FILES[type])
      const source = readFileSync(filePath, 'utf8')

      expect(source.includes('createMemberNotification')).toBe(true)
      expect(source.includes(`type: '${type}'`)).toBe(true)
    }
  })
})
