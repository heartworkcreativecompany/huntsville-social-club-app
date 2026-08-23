import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildMemberEntitlements,
  canStartMessageRequest,
  canUseMessaging,
  messagingUpgradeMessage,
  MUTUAL_MESSAGING_REQUIRED_MESSAGE,
} from '@/lib/membership-entitlements'
import {
  MEMBER_MESSAGING_MUTUAL_REQUIRED_COPY,
  MEMBER_MESSAGING_UPGRADE_PATH,
  memberFirstNameForMessaging,
  profileMessagingUiMode,
  resolveProfileMessageRecipientId,
} from '@/lib/member-profile-messaging'

function entitlements(paid: boolean) {
  return buildMemberEntitlements({
    role: 'member',
    billing: paid
      ? { tier: 'inner_circle', subscription_status: 'active' }
      : { tier: 'member', subscription_status: 'none' },
    applicationApproved: true,
    activeCycle: null,
  })
}

describe('member profile messaging helpers', () => {
  it('resolves recipient from the route/profile id, not form input', () => {
    expect(resolveProfileMessageRecipientId('profile_from_route')).toBe(
      'profile_from_route'
    )
    expect(resolveProfileMessageRecipientId('vs_user_from_db')).not.toBe(
      'attacker_supplied_id'
    )
  })

  it('derives first name for Message headings', () => {
    expect(memberFirstNameForMessaging('Alex Rivera')).toBe('Alex')
    expect(memberFirstNameForMessaging(null)).toBe('Member')
  })

  it('hides messaging UI on self profiles', () => {
    expect(
      profileMessagingUiMode({
        isSelf: true,
        senderCanMessage: true,
        recipientCanMessage: true,
      })
    ).toBe('hidden')
  })

  it('shows composer when both sender and recipient can message', () => {
    expect(
      profileMessagingUiMode({
        isSelf: false,
        senderCanMessage: true,
        recipientCanMessage: true,
      })
    ).toBe('composer')
  })

  it('shows upgrade lock for free sender regardless of recipient', () => {
    expect(
      profileMessagingUiMode({
        isSelf: false,
        senderCanMessage: false,
        recipientCanMessage: true,
      })
    ).toBe('upgrade')
    expect(
      profileMessagingUiMode({
        isSelf: false,
        senderCanMessage: false,
        recipientCanMessage: false,
      })
    ).toBe('upgrade')
  })

  it('shows neutral unavailable notice for paid sender + ineligible recipient', () => {
    expect(
      profileMessagingUiMode({
        isSelf: false,
        senderCanMessage: true,
        recipientCanMessage: false,
      })
    ).toBe('unavailable')
  })

  it('shows composer after recipient becomes paid (refreshed entitlements)', () => {
    expect(
      profileMessagingUiMode({
        isSelf: false,
        senderCanMessage: true,
        recipientCanMessage: false,
      })
    ).toBe('unavailable')
    expect(
      profileMessagingUiMode({
        isSelf: false,
        senderCanMessage: true,
        recipientCanMessage: true,
      })
    ).toBe('composer')
  })

  it('uses the canonical /upgrade path', () => {
    expect(MEMBER_MESSAGING_UPGRADE_PATH).toBe('/upgrade')
  })
})

describe('mutual messaging eligibility', () => {
  it('allows new requests only when both parties can message and ids differ', () => {
    const paid = entitlements(true)
    const free = entitlements(false)
    expect(
      canStartMessageRequest({
        senderEntitlements: paid,
        recipientEntitlements: paid,
        senderId: 'a',
        recipientId: 'b',
      })
    ).toBe(true)
    expect(
      canStartMessageRequest({
        senderEntitlements: paid,
        recipientEntitlements: free,
        senderId: 'a',
        recipientId: 'b',
      })
    ).toBe(false)
    expect(
      canStartMessageRequest({
        senderEntitlements: free,
        recipientEntitlements: paid,
        senderId: 'a',
        recipientId: 'b',
      })
    ).toBe(false)
    expect(
      canStartMessageRequest({
        senderEntitlements: paid,
        recipientEntitlements: paid,
        senderId: 'a',
        recipientId: 'a',
      })
    ).toBe(false)
  })

  it('uses a safe mutual error that does not leak plan or billing details', () => {
    expect(MUTUAL_MESSAGING_REQUIRED_MESSAGE).toBe(
      'Messaging is available when both members have an active paid membership.'
    )
    expect(MEMBER_MESSAGING_MUTUAL_REQUIRED_COPY).toBe(
      MUTUAL_MESSAGING_REQUIRED_MESSAGE
    )
    expect(MUTUAL_MESSAGING_REQUIRED_MESSAGE).not.toMatch(
      /free|inner|elite|stripe|subscription|billing|tier|plan/i
    )
  })

  it('keeps sender upgrade messaging for free members via canUseMessaging', () => {
    const free = entitlements(false)
    expect(canUseMessaging(free)).toBe(false)
    expect(messagingUpgradeMessage(free.productTier)).toMatch(/Upgrade/i)
  })
})

describe('server wiring for new requests vs replies', () => {
  it('requestMemberIntro and sendMessageRequest enforce mutual start checks', () => {
    const intro = readFileSync(
      join(__dirname, '../app/(club)/members/intro-actions.ts'),
      'utf8'
    )
    expect(intro).toContain('assertCanStartMessageRequest')
    expect(intro).toContain('sendMessageRequest')

    const actions = readFileSync(
      join(__dirname, '../app/(club)/messages/actions.ts'),
      'utf8'
    )
    const start = actions.indexOf('export async function sendMessageRequest')
    const next = actions.indexOf('\nexport async function ', start + 10)
    const body = actions.slice(start, next === -1 ? undefined : next)
    expect(body).toContain('assertCanStartMessageRequest')
    expect(body).toContain('targetMemberId: input.targetMemberId')
  })

  it('reply paths still use assertMessagingAllowed with conversationId', () => {
    const actions = readFileSync(
      join(__dirname, '../app/(club)/messages/actions.ts'),
      'utf8'
    )
    expect(actions).toContain('assertMessagingAllowed({ conversationId')
    expect(actions).toContain('canSendMessageInConversation')

    const requireSource = readFileSync(
      join(__dirname, '../lib/require-messaging.ts'),
      'utf8'
    )
    expect(requireSource).toContain('isCuratedIntroConversationForMember')
    expect(requireSource).toContain('isMessageRequestConversationForMember')
    expect(requireSource).toContain('assertCanStartMessageRequest')
    expect(requireSource).toContain('MUTUAL_MESSAGING_REQUIRED_MESSAGE')
  })

  it('profile page loads recipient entitlements and does not use user_metadata', () => {
    const source = readFileSync(
      join(__dirname, '../app/(club)/members/[id]/page.tsx'),
      'utf8'
    )
    expect(source).toContain('loadMemberEntitlementsForUserId')
    expect(source).toContain('senderCanMessage')
    expect(source).toContain('recipientCanMessage')
    expect(source).not.toContain('user_metadata')
  })

  it('profile message panel binds recipient from prop, not form input', () => {
    const source = readFileSync(
      join(
        __dirname,
        '../components/members/member-profile-message-panel.tsx'
      ),
      'utf8'
    )
    expect(source).toMatch(/requestMemberIntro\(targetMemberId,\s*body\)/)
    expect(source).not.toContain('name="targetMemberId"')
  })
})
