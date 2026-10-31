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
        senderIdentity: 'verified',
        recipientIdentity: 'verified',
      })
    ).toBe('hidden')
  })

  it('shows composer when both members have accepted identity', () => {
    expect(
      profileMessagingUiMode({
        isSelf: false,
        senderIdentity: 'verified',
        recipientIdentity: 'verified',
      })
    ).toBe('composer')
  })

  it('asks the viewer to verify identity instead of offering a paid upgrade', () => {
    expect(
      profileMessagingUiMode({
        isSelf: false,
        senderIdentity: 'unverified',
        recipientIdentity: 'verified',
      })
    ).toBe('identity_required')
    expect(
      profileMessagingUiMode({
        isSelf: false,
        senderIdentity: 'unverified',
        recipientIdentity: 'unverified',
      })
    ).toBe('identity_required')
  })

  it('shows neutral unavailable notice when the recipient is not identity verified', () => {
    expect(
      profileMessagingUiMode({
        isSelf: false,
        senderIdentity: 'verified',
        recipientIdentity: 'unverified',
      })
    ).toBe('unavailable')
  })

  it('shows composer after the recipient identity decision is refreshed', () => {
    expect(
      profileMessagingUiMode({
        isSelf: false,
        senderIdentity: 'verified',
        recipientIdentity: 'unverified',
      })
    ).toBe('unavailable')
    expect(
      profileMessagingUiMode({
        isSelf: false,
        senderIdentity: 'verified',
        recipientIdentity: 'verified',
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
      'Messaging is available when both members have verified identity.'
    )
    expect(MEMBER_MESSAGING_MUTUAL_REQUIRED_COPY).toBe(
      MUTUAL_MESSAGING_REQUIRED_MESSAGE
    )
    expect(MUTUAL_MESSAGING_REQUIRED_MESSAGE).not.toMatch(
      /free|inner|elite|stripe|subscription|billing|tier|plan/i
    )
  })

  it('keeps paid messaging entitlement separate from intentional identity access', () => {
    const free = entitlements(false)
    expect(canUseMessaging(free)).toBe(false)
    expect(messagingUpgradeMessage(free.productTier)).toMatch(/verified identity/i)
    expect(messagingUpgradeMessage(free.productTier)).not.toMatch(/upgrade/i)
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
    expect(requireSource).not.toContain('isCuratedIntroConversationForMember')
    expect(requireSource).not.toContain('isMessageRequestConversationForMember')
    expect(requireSource).toContain('assertCanStartMessageRequest')
    expect(requireSource).toContain('IDENTITY_MUTUAL_MESSAGE')
    expect(requireSource).toContain('loadAcceptedIdentityStatus')
    expect(requireSource).not.toContain('canUseMessaging')
  })

  it('profile page loads identity decisions and does not use user_metadata', () => {
    const source = readFileSync(
      join(__dirname, '../app/(club)/members/[id]/page.tsx'),
      'utf8'
    )
    expect(source).not.toContain('loadMemberEntitlementsForUserId')
    expect(source).toContain('senderIdentity')
    expect(source).toContain('recipientIdentity')
    expect(source).toContain('loadAcceptedIdentityStatus')
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
