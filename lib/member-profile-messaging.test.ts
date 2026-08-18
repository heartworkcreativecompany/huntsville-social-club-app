import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildMemberEntitlements,
  canUseMessaging,
  messagingUpgradeMessage,
} from '@/lib/membership-entitlements'
import {
  MEMBER_MESSAGING_UPGRADE_PATH,
  memberFirstNameForMessaging,
  profileMessagingUiMode,
  resolveProfileMessageRecipientId,
} from '@/lib/member-profile-messaging'

describe('member profile messaging helpers', () => {
  it('resolves recipient from the route/profile id, not form input', () => {
    expect(resolveProfileMessageRecipientId('profile_from_route')).toBe(
      'profile_from_route'
    )
    // Form-supplied ids must not override — helper only accepts the route id.
    expect(resolveProfileMessageRecipientId('vs_user_from_db')).not.toBe(
      'attacker_supplied_id'
    )
  })

  it('derives first name for Message headings', () => {
    expect(memberFirstNameForMessaging('Alex Rivera')).toBe('Alex')
    expect(memberFirstNameForMessaging(null)).toBe('Member')
  })

  it('hides composer on self profiles and upgrades free members', () => {
    expect(profileMessagingUiMode({ isSelf: true, canMessage: true })).toBe(
      'hidden'
    )
    expect(profileMessagingUiMode({ isSelf: false, canMessage: true })).toBe(
      'composer'
    )
    expect(profileMessagingUiMode({ isSelf: false, canMessage: false })).toBe(
      'upgrade'
    )
  })

  it('uses the canonical /upgrade path', () => {
    expect(MEMBER_MESSAGING_UPGRADE_PATH).toBe('/upgrade')
  })
})

describe('server-side messaging entitlement (unchanged gate)', () => {
  it('denies messaging for free members via canUseMessaging', () => {
    const free = buildMemberEntitlements({
      role: 'member',
      billing: { tier: 'member', subscription_status: 'none' },
      applicationApproved: true,
      activeCycle: null,
    })
    expect(canUseMessaging(free)).toBe(false)
    expect(messagingUpgradeMessage(free.productTier)).toMatch(/Upgrade/i)
  })

  it('allows messaging for paid Inner Circle with active subscription', () => {
    const paid = buildMemberEntitlements({
      role: 'member',
      billing: {
        tier: 'inner_circle',
        subscription_status: 'active',
      },
      applicationApproved: true,
      activeCycle: null,
    })
    expect(canUseMessaging(paid)).toBe(true)
  })

  it('requestMemberIntro still runs assertMessagingAllowed before sendMessageRequest', () => {
    const source = readFileSync(
      join(__dirname, '../app/(club)/members/intro-actions.ts'),
      'utf8'
    )
    const fnStart = source.indexOf('export async function requestMemberIntro')
    expect(fnStart).toBeGreaterThan(-1)
    const body = source.slice(fnStart)
    expect(body).toContain('assertMessagingAllowed')
    expect(body).toContain('sendMessageRequest')
    expect(body.indexOf('assertMessagingAllowed')).toBeLessThan(
      body.indexOf('sendMessageRequest')
    )
  })

  it('profile message panel binds recipient from prop, not form input', () => {
    const source = readFileSync(
      join(
        __dirname,
        '../components/members/member-profile-message-panel.tsx'
      ),
      'utf8'
    )
    expect(source).toContain('requestMemberIntro(targetMemberId, body)')
    expect(source).not.toContain('name="targetMemberId"')
  })

  it('profile page wires recipient from loaded member.id (route record)', () => {
    const source = readFileSync(
      join(__dirname, '../app/(club)/members/[id]/page.tsx'),
      'utf8'
    )
    expect(source).toContain('resolveProfileMessageRecipientId(member.id)')
    expect(source).toContain('MemberProfileMessagePanel')
    expect(source).toContain('buildMemberEntitlements')
    expect(source).toMatch(/isSelf[\s\S]*MemberProfileMessagePanel|!isSelf/)
  })
})
